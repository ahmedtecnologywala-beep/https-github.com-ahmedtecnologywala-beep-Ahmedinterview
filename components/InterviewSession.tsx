import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { UserConfig, StreamPlatform, StreamConfig } from '../types';
import { createBlob, decode, decodeAudioData } from '../services/audioUtils';

interface InterviewSessionProps {
  userConfig: UserConfig;
  onEnd: () => void;
}

type TabType = 'comments' | 'banners' | 'brand';

const InterviewSession: React.FC<InterviewSessionProps> = ({ userConfig, onEnd }) => {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('comments');
  const [showDestinations, setShowDestinations] = useState(false);
  
  const [streamConfig, setStreamConfig] = useState<StreamConfig>({
    isStreaming: false,
    platform: null,
    duration: 0
  });
  const [aiIsSpeaking, setAiIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Constants
  const SAMPLE_RATE_INPUT = 16000;
  const SAMPLE_RATE_OUTPUT = 24000;

  // Cleanup Function
  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    if (sessionRef.current) {
      sessionRef.current = null;
    }
  }, []);

  // Initialize Media and AI
  useEffect(() => {
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: SAMPLE_RATE_INPUT
            }
        });
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE_INPUT });
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE_OUTPUT });

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const config = {
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: `You are a professional interviewer named "Ahmed". You are interviewing ${userConfig.name} for the role of ${userConfig.jobRole}. Be professional, polite, but rigorous. Ask one question at a time. Keep responses concise.`,
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
          },
          callbacks: {
            onopen: () => {
              console.log("Connected to Gemini Live");
              setIsConnected(true);
              
              if (!inputContextRef.current || !mediaStreamRef.current) return;
              
              const source = inputContextRef.current.createMediaStreamSource(mediaStreamRef.current);
              const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
              
              processor.onaudioprocess = (e) => {
                if (!isMicOn) return; // Mute logic
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                
                if (sessionRef.current) {
                    sessionRef.current.then((session: any) => {
                        session.sendRealtimeInput({ media: pcmBlob });
                    });
                }
              };

              source.connect(processor);
              processor.connect(inputContextRef.current.destination);
              
              sourceRef.current = source;
              processorRef.current = processor;
            },
            onmessage: async (message: LiveServerMessage) => {
              const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (base64Audio && audioContextRef.current) {
                setAiIsSpeaking(true);
                setTimeout(() => setAiIsSpeaking(false), 200);

                const ctx = audioContextRef.current;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                try {
                    const audioBuffer = await decodeAudioData(
                        decode(base64Audio),
                        ctx,
                        SAMPLE_RATE_OUTPUT,
                        1
                    );
                    
                    const source = ctx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(ctx.destination);
                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += audioBuffer.duration;
                } catch (err) {
                    console.error("Audio decoding error", err);
                }
              }
              if (message.serverContent?.interrupted) {
                 nextStartTimeRef.current = 0;
              }
            },
            onclose: () => {
              setIsConnected(false);
            },
            onerror: (e: any) => {
              console.error("Gemini Error", e);
              setError("Connection error with AI service.");
            }
          }
        };

        const sessionPromise = ai.live.connect(config);
        sessionRef.current = sessionPromise;

      } catch (err: any) {
        console.error("Initialization Error:", err);
        setError("Could not access camera/microphone or connect to API.");
      }
    };

    init();
    return cleanup;
  }, [userConfig, cleanup]);

  // Handlers
  const toggleMic = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isMicOn;
      });
      setIsMicOn(!isMicOn);
    }
  };

  const toggleCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !isCameraOn;
      });
      setIsCameraOn(!isCameraOn);
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        if (videoRef.current && mediaStreamRef.current) {
            const sender = mediaStreamRef.current.getVideoTracks()[0];
            sender.stop(); // Stop current cam
            mediaStreamRef.current.removeTrack(sender);
            mediaStreamRef.current.addTrack(screenTrack);
            videoRef.current.srcObject = mediaStreamRef.current;
        }

        screenTrack.onended = () => {
             stopScreenShare();
        };

        setIsScreenSharing(true);
      } catch (e) {
        console.error("Screen share failed", e);
      }
    } else {
        stopScreenShare();
    }
  };

  const stopScreenShare = async () => {
      try {
          const userStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const userTrack = userStream.getVideoTracks()[0];

          if (mediaStreamRef.current && videoRef.current) {
               const currentVideoTrack = mediaStreamRef.current.getVideoTracks()[0];
               currentVideoTrack.stop();
               mediaStreamRef.current.removeTrack(currentVideoTrack);
               mediaStreamRef.current.addTrack(userTrack);
               videoRef.current.srcObject = mediaStreamRef.current;
          }
          setIsScreenSharing(false);
      } catch (e) {
          console.error("Failed to revert to camera", e);
      }
  }

  const handleGoLive = (selectedPlatforms: StreamPlatform[]) => {
      if (selectedPlatforms.length === 0) return;
      
      // Start recording
      if (!mediaStreamRef.current) return;
      recordedChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') 
          ? 'video/webm; codecs=vp9' 
          : 'video/webm';
      
      const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType });
      recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
              recordedChunksRef.current.push(event.data);
          }
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;

      setStreamConfig({
          isStreaming: true,
          platform: selectedPlatforms[0], // Simplified for now
          duration: 0
      });
      
      timerIntervalRef.current = window.setInterval(() => {
          setStreamConfig(prev => ({ ...prev, duration: prev.duration + 1 }));
      }, 1000);
      setShowDestinations(false);
  };

  const stopLiveStream = () => {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
      }
      setStreamConfig(prev => ({ ...prev, isStreaming: false }));
  };

  const downloadRecording = () => {
    if (recordedChunksRef.current.length === 0) {
        alert("No recording data available yet.");
        return;
    }
    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style.display = 'none';
    a.href = url;
    a.download = `ahmed-interview-${new Date().toISOString()}.webm`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-screen bg-[#18181b] text-white font-sans overflow-hidden">
        {/* Header */}
        <div className="h-14 bg-[#18181b] border-b border-[#3f3f46] flex items-center justify-between px-4 z-50">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-tr from-brand-500 to-purple-600 rounded flex items-center justify-center font-bold text-lg">A</div>
                <span className="font-semibold text-lg hidden md:inline">Ahmed Interview Studio</span>
            </div>
            
            <div className="flex items-center gap-4">
                 {streamConfig.isStreaming && (
                     <div className="flex items-center gap-2 text-red-500 font-medium">
                         <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                         {formatTime(streamConfig.duration)}
                     </div>
                 )}
                 <button className="text-gray-400 hover:text-white text-sm font-medium">
                    Edit Destinations
                 </button>
                 {!streamConfig.isStreaming ? (
                    <button 
                        onClick={() => setShowDestinations(true)}
                        className="bg-brand-500 hover:bg-brand-600 text-white px-6 py-1.5 rounded text-sm font-bold shadow-lg transition-colors"
                    >
                        Go Live
                    </button>
                 ) : (
                    <button 
                        onClick={stopLiveStream}
                        className="bg-red-500 hover:bg-red-600 text-white px-6 py-1.5 rounded text-sm font-bold shadow-lg transition-colors"
                    >
                        End Broadcast
                    </button>
                 )}
            </div>
        </div>

        {/* Main Workspace */}
        <div className="flex flex-1 overflow-hidden">
            {/* Left Stage Area */}
            <div className="flex-1 flex flex-col relative bg-[#18181b]">
                {/* Canvas */}
                <div className="flex-1 p-4 md:p-8 flex items-center justify-center">
                    <div className="w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden relative shadow-2xl border border-[#27272a] group">
                        
                        {/* Stream Content */}
                        <div className="w-full h-full flex items-center justify-center p-1 gap-1">
                            {/* User Feed */}
                            <div className="relative h-full flex-1 bg-[#18181b] overflow-hidden">
                                <video 
                                    ref={videoRef}
                                    autoPlay 
                                    playsInline 
                                    muted 
                                    className={`w-full h-full object-cover transform ${!isScreenSharing ? 'scale-x-[-1]' : ''} ${!isCameraOn ? 'opacity-0' : 'opacity-100'}`}
                                />
                                {!isCameraOn && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-20 h-20 rounded-full bg-[#27272a] text-gray-400 flex items-center justify-center text-2xl font-bold">
                                            {userConfig.name.charAt(0)}
                                        </div>
                                    </div>
                                )}
                                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded font-medium flex items-center gap-2">
                                    {userConfig.name}
                                    {!isMicOn && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </div>
                            </div>
                            
                            {/* AI Feed */}
                            {isConnected && (
                                <div className="relative h-full flex-1 bg-[#18181b] overflow-hidden border-l border-black">
                                    <div className="w-full h-full flex items-center justify-center">
                                         <div className={`w-24 h-24 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center transition-transform duration-100 ${aiIsSpeaking ? 'scale-110 shadow-[0_0_30px_rgba(59,130,246,0.5)]' : 'scale-100'}`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                            </svg>
                                         </div>
                                    </div>
                                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded font-medium">
                                        Ahmed (AI Host)
                                    </div>
                                    {/* AI Audio Visualizer Bars Overlay */}
                                    {aiIsSpeaking && (
                                        <div className="absolute bottom-10 right-10 flex gap-1 items-end h-8">
                                            <div className="w-1 bg-brand-500 animate-[bounce_0.5s_infinite] h-4"></div>
                                            <div className="w-1 bg-brand-500 animate-[bounce_0.5s_infinite_0.1s] h-6"></div>
                                            <div className="w-1 bg-brand-500 animate-[bounce_0.5s_infinite_0.2s] h-3"></div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Brand Logo Overlay on Canvas */}
                        <div className="absolute top-4 right-4 bg-white/10 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold uppercase tracking-wider text-white/80 pointer-events-none">
                            Powered by Ahmed Interview
                        </div>
                    </div>
                </div>

                {/* Bottom Toolbar */}
                <div className="h-16 border-t border-[#3f3f46] bg-[#18181b] flex items-center justify-center gap-2 md:gap-4 px-4">
                     <button onClick={toggleMic} className={`flex flex-col items-center justify-center w-16 gap-1 hover:bg-[#27272a] p-1 rounded ${!isMicOn ? 'text-red-500' : 'text-gray-300'}`}>
                        <div className={`p-2 rounded-full ${!isMicOn ? 'bg-red-500/10' : ''}`}>
                            {isMicOn ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                            )}
                        </div>
                        <span className="text-[10px] font-medium">Mute</span>
                     </button>

                     <button onClick={toggleCamera} className={`flex flex-col items-center justify-center w-16 gap-1 hover:bg-[#27272a] p-1 rounded ${!isCameraOn ? 'text-red-500' : 'text-gray-300'}`}>
                        <div className={`p-2 rounded-full ${!isCameraOn ? 'bg-red-500/10' : ''}`}>
                             {isCameraOn ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                             ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                             )}
                        </div>
                        <span className="text-[10px] font-medium">Stop Cam</span>
                     </button>
                     
                     <div className="h-8 w-px bg-[#3f3f46] mx-2"></div>

                     <button onClick={toggleScreenShare} className={`flex flex-col items-center justify-center w-16 gap-1 hover:bg-[#27272a] p-1 rounded text-gray-300 ${isScreenSharing ? 'text-brand-500' : ''}`}>
                        <div className="p-2">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        </div>
                        <span className="text-[10px] font-medium">Present</span>
                     </button>
                     
                     <button onClick={() => alert('Invite functionality simulated')} className="flex flex-col items-center justify-center w-16 gap-1 hover:bg-[#27272a] p-1 rounded text-gray-300">
                        <div className="p-2">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                        </div>
                        <span className="text-[10px] font-medium">Invite</span>
                     </button>

                     <div className="h-8 w-px bg-[#3f3f46] mx-2"></div>

                     <button onClick={onEnd} className="flex flex-col items-center justify-center w-16 gap-1 hover:bg-red-500/10 p-1 rounded text-red-500">
                        <div className="p-2">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        </div>
                        <span className="text-[10px] font-medium">Leave</span>
                     </button>
                     
                     {recordedChunksRef.current.length > 0 && (
                        <button onClick={downloadRecording} className="flex flex-col items-center justify-center w-16 gap-1 hover:bg-[#27272a] p-1 rounded text-gray-300 ml-auto">
                            <div className="p-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            </div>
                            <span className="text-[10px] font-medium">Record</span>
                        </button>
                     )}
                </div>
            </div>

            {/* Right Sidebar */}
            <div className="w-80 bg-[#27272a] border-l border-[#3f3f46] flex flex-col">
                {/* Tabs */}
                <div className="flex border-b border-[#3f3f46]">
                    <button 
                        onClick={() => setActiveTab('comments')}
                        className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'comments' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
                    >
                        Comments
                    </button>
                    <button 
                        onClick={() => setActiveTab('banners')}
                        className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'banners' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
                    >
                        Banners
                    </button>
                    <button 
                        onClick={() => setActiveTab('brand')}
                        className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'brand' ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
                    >
                        Brand
                    </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {activeTab === 'comments' && (
                        <div className="text-center mt-10">
                            <div className="bg-[#3f3f46] rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <h3 className="text-gray-200 font-medium mb-2">StreamYard Style Comments</h3>
                            <p className="text-gray-500 text-sm">
                                Viewers' comments on Facebook, LinkedIn, and YouTube will show up here.
                            </p>
                        </div>
                    )}
                    {activeTab === 'banners' && (
                        <div className="space-y-3">
                            <p className="text-gray-400 text-sm mb-2">Click to show on screen</p>
                            <div className="bg-[#3f3f46] p-3 rounded cursor-pointer hover:bg-[#52525b] border-l-4 border-transparent hover:border-brand-500 transition-all">
                                <p className="text-sm font-medium">Welcome to Ahmed Interview!</p>
                            </div>
                            <div className="bg-[#3f3f46] p-3 rounded cursor-pointer hover:bg-[#52525b] border-l-4 border-transparent hover:border-brand-500 transition-all">
                                <p className="text-sm font-medium">Topic: {userConfig.jobRole}</p>
                            </div>
                            <div className="bg-[#3f3f46] p-3 rounded cursor-pointer hover:bg-[#52525b] border-l-4 border-transparent hover:border-brand-500 transition-all">
                                <p className="text-sm font-medium">Follow us for more updates</p>
                            </div>
                        </div>
                    )}
                    {activeTab === 'brand' && (
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Brand Color</h4>
                                <div className="flex gap-2">
                                    <div className="w-8 h-8 rounded-full bg-brand-500 cursor-pointer ring-2 ring-white"></div>
                                    <div className="w-8 h-8 rounded-full bg-purple-500 cursor-pointer hover:opacity-80"></div>
                                    <div className="w-8 h-8 rounded-full bg-orange-500 cursor-pointer hover:opacity-80"></div>
                                    <div className="w-8 h-8 rounded-full bg-green-500 cursor-pointer hover:opacity-80"></div>
                                </div>
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Theme</h4>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 p-2 bg-[#3f3f46] rounded border border-brand-500 cursor-pointer">
                                        <div className="w-4 h-4 rounded-full bg-brand-500"></div>
                                        <span className="text-sm">Default</span>
                                    </div>
                                    <div className="flex items-center gap-2 p-2 bg-[#3f3f46] rounded border border-transparent hover:border-gray-500 cursor-pointer">
                                        <div className="w-4 h-4 rounded-none bg-gray-500"></div>
                                        <span className="text-sm">Minimal</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        
        {/* Go Live Modal */}
        {showDestinations && (
            <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#27272a] border border-[#3f3f46] rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div className="p-6 border-b border-[#3f3f46]">
                        <h3 className="text-xl font-bold">Broadcast Destinations</h3>
                        <p className="text-gray-400 text-sm mt-1">Where do you want to stream to?</p>
                    </div>
                    <div className="p-6 space-y-4">
                        <label className="flex items-center gap-4 p-4 rounded-lg border border-[#3f3f46] bg-[#18181b] cursor-pointer hover:border-brand-500 transition-colors">
                            <input type="checkbox" className="w-5 h-5 accent-brand-500" defaultChecked />
                            <span className="font-semibold">Facebook Live</span>
                        </label>
                        <label className="flex items-center gap-4 p-4 rounded-lg border border-[#3f3f46] bg-[#18181b] cursor-pointer hover:border-brand-500 transition-colors">
                            <input type="checkbox" className="w-5 h-5 accent-brand-500" defaultChecked />
                            <span className="font-semibold">LinkedIn Live</span>
                        </label>
                        <label className="flex items-center gap-4 p-4 rounded-lg border border-[#3f3f46] bg-[#18181b] cursor-pointer hover:border-brand-500 transition-colors">
                            <input type="checkbox" className="w-5 h-5 accent-brand-500" />
                            <span className="font-semibold">YouTube</span>
                        </label>
                        <label className="flex items-center gap-4 p-4 rounded-lg border border-[#3f3f46] bg-[#18181b] cursor-pointer hover:border-brand-500 transition-colors">
                            <input type="checkbox" className="w-5 h-5 accent-brand-500" />
                            <span className="font-semibold">Instagram (via RTMP)</span>
                        </label>
                    </div>
                    <div className="p-6 border-t border-[#3f3f46] flex justify-end gap-3">
                        <button 
                            onClick={() => setShowDestinations(false)}
                            className="px-4 py-2 text-gray-300 hover:text-white font-medium"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={() => handleGoLive([StreamPlatform.FACEBOOK])}
                            className="px-6 py-2 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded shadow-lg"
                        >
                            Go Live
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default InterviewSession;