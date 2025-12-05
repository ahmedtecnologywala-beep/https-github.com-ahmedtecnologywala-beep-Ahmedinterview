import React, { useState } from 'react';
import WelcomeScreen from './components/WelcomeScreen';
import InterviewSession from './components/InterviewSession';
import { AppState, UserConfig } from './types';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [userConfig, setUserConfig] = useState<UserConfig | null>(null);

  const handleStart = (config: UserConfig) => {
    setUserConfig(config);
    setAppState(AppState.INTERVIEW);
  };

  const handleEnd = () => {
    setAppState(AppState.ENDED);
    // Simple reset after ending to show Setup again for demo purposes
    setTimeout(() => {
        setAppState(AppState.SETUP);
        setUserConfig(null);
    }, 2000);
  };

  return (
    <div className="antialiased text-slate-900 bg-white">
      {appState === AppState.SETUP && (
        <WelcomeScreen onStart={handleStart} />
      )}
      
      {appState === AppState.INTERVIEW && userConfig && (
        <InterviewSession userConfig={userConfig} onEnd={handleEnd} />
      )}

      {appState === AppState.ENDED && (
        <div className="flex items-center justify-center h-screen bg-black text-white">
            <div className="text-center">
                <h2 className="text-3xl font-bold mb-4">Interview Ended</h2>
                <p className="text-gray-400">Processing session data...</p>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
