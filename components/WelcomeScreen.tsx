import React, { useState, useEffect, useRef } from 'react';
import { UserConfig } from '../types';

interface WelcomeScreenProps {
  onStart: (config: UserConfig) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart }) => {
  const [name, setName] = useState('');
  const [jobRole, setJobRole] = useState('Frontend Developer');
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.error("Camera access denied", e);
      }
    };
    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Effect to toggle tracks based on state
  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getAudioTracks().forEach(t => t.enabled = isMicOn);
      stream.getVideoTracks().forEach(t => t.enabled = isCamOn);
    }
  }, [isMicOn, isCamOn]);

  const handleEnter = () => {
    if (name.trim()) {
      onStart({ name, jobRole });
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#18181b] text-white">
      {/* Left Side - Camera Preview */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#0f0f11]">
        <div className="max-w-2xl w-full text-center mb-8">
            <h1 className="text-2xl font-bold mb-2">Let's check your camera and mic</h1>
            <p className="text-gray-400">You'll be able to configure your destination after entering the studio.</p>
        </div>

        <div className="relative w-full max-w-2xl aspect-video bg-black rounded-lg overflow-hidden shadow-2xl border border-[#3f3f46]">
          <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline 
            className={`w-full h-full object-cover transform scale-x-[-1] ${!isCamOn ? 'opacity-0' : 'opacity-100'}`} 
          />
          {!isCamOn && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-[#27272a] flex items-center justify-center text-3xl font-bold">
                {name ? name.charAt(0).toUpperCase() : '?'}
              </div>
            </div>
          )}
          
          <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded text-sm font-medium">
             {name || "Your Name"}
          </div>

          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4">
             <button 
                onClick={() => setIsMicOn(!isMicOn)}
                className={`p-3 rounded-full ${!isMicOn ? 'bg-red-500 hover:bg-red-600' : 'bg-[#27272a] hover:bg-[#3f3f46]'} transition-colors`}
             >
                {isMicOn ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                )}
             </button>
             <button 
                onClick={() => setIsCamOn(!isCamOn)}
                className={`p-3 rounded-full ${!isCamOn ? 'bg-red-500 hover:bg-red-600' : 'bg-[#27272a] hover:bg-[#3f3f46]'} transition-colors`}
             >
                {isCamOn ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.919 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" /><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" /></svg>
                )}
             </button>
          </div>
          
          <div className="absolute top-4 right-4">
            <div className="flex gap-2">
                 <div className="bg-black/50 px-2 py-1 rounded text-xs">Mic is {isMicOn ? 'working' : 'off'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Input Details */}
      <div className="w-full md:w-[400px] bg-[#18181b] border-l border-[#27272a] p-8 flex flex-col justify-center">
         <div className="text-center mb-8">
            <h2 className="text-xl font-bold">Ahmed Interview Studio</h2>
         </div>

         <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Display Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500 text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Interview Role (Topic)</label>
              <select
                 value={jobRole}
                 onChange={(e) => setJobRole(e.target.value)}
                 className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500 text-white"
              >
                  <option value="Frontend Developer">Frontend Developer</option>
                  <option value="Backend Engineer">Backend Engineer</option>
                  <option value="Product Manager">Product Manager</option>
                  <option value="UI/UX Designer">UI/UX Designer</option>
                  <option value="General Chat">General Conversation</option>
              </select>
            </div>

            <button
               onClick={handleEnter}
               disabled={!name.trim()}
               className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded transition-colors"
            >
               Enter Studio
            </button>
         </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;