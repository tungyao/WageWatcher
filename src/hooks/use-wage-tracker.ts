
'use client';

import { useState, useEffect, useCallback } from 'react';
import { shouldAnimate } from '@/ai/flows/animation-orchestrator';
import type { AnimationOrchestratorInput } from '@/ai/flows/animation-orchestrator';
import { useToast } from '@/hooks/use-toast';

const LOCAL_STORAGE_KEY = 'wageWatcherDataV2'; // V2 for new time logic

const DEFAULT_HOURLY_WAGE = 20;
const DEFAULT_WORK_DURATION_HOURS = 8;
const DEFAULT_CELEBRATION_THRESHOLD = 100;

type WageWatcherPersistentData = {
  hourlyWage: number;
  workDurationHours: number;
  celebrationThreshold: number;
  isRunning: boolean;
  elapsedTimeBeforeCurrentSession: number; // Seconds
  sessionStartTime?: number; // Timestamp for current running session
  lastAnimationEarningsCheck: number; 
  lastAnimationTimestamp: number; 
};

export function useWageTracker() {
  const { toast } = useToast();

  const [inputs, setInputs] = useState({
    hourlyWage: DEFAULT_HOURLY_WAGE.toString(),
    workDurationHours: DEFAULT_WORK_DURATION_HOURS.toString(),
    celebrationThreshold: DEFAULT_CELEBRATION_THRESHOLD.toString(),
  });

  const [isRunning, setIsRunning] = useState(false);
  const [elapsedTimeBeforeCurrentSession, setElapsedTimeBeforeCurrentSession] = useState(0); // Stores total elapsed time when timer is paused
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null); // Timestamp when current session started
  
  const [currentTotalElapsedTime, setCurrentTotalElapsedTime] = useState(0); // Continuously updated total elapsed time
  const [currentEarnings, setCurrentEarnings] = useState(0);
  
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastAnimationEarningsCheck, setLastAnimationEarningsCheck] = useState(0);
  const [lastAnimationTimestamp, setLastAnimationTimestamp] = useState(0);

  // Load from localStorage on mount and decide auto-start
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDataRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      
      let resolvedHourlyWageStr = inputs.hourlyWage; // Default initially
      let resolvedWorkDurationStr = inputs.workDurationHours; // Default initially
      let resolvedCelebrationThresholdStr = inputs.celebrationThreshold; // Default initially
      let resolvedElapsedTimeBeforeSession = 0;
      let resolvedLastAnimationTimestamp = 0;
      let resolvedLastAnimationEarningsCheck = 0;
      let shouldResumeRunning = false;
      let resumeSessionStartTime: number | null = null;

      if (savedDataRaw) {
        try {
          const savedData: WageWatcherPersistentData = JSON.parse(savedDataRaw);
          resolvedHourlyWageStr = savedData.hourlyWage.toString();
          resolvedWorkDurationStr = savedData.workDurationHours.toString();
          resolvedCelebrationThresholdStr = savedData.celebrationThreshold.toString();
          resolvedElapsedTimeBeforeSession = savedData.elapsedTimeBeforeCurrentSession || 0;
          resolvedLastAnimationTimestamp = savedData.lastAnimationTimestamp || 0;
          resolvedLastAnimationEarningsCheck = savedData.lastAnimationEarningsCheck || 0;

          if (savedData.isRunning && typeof savedData.sessionStartTime === 'number') {
            shouldResumeRunning = true;
            resumeSessionStartTime = savedData.sessionStartTime;
          }
        } catch (error) {
          console.error("Failed to parse saved data from localStorage", error);
          localStorage.removeItem(LOCAL_STORAGE_KEY);
          // Defaults are already set in resolvedHourlyWageStr etc. if error occurs
        }
      }

      // Apply resolved values to state
      setInputs({
        hourlyWage: resolvedHourlyWageStr,
        workDurationHours: resolvedWorkDurationStr,
        celebrationThreshold: resolvedCelebrationThresholdStr,
      });
      setElapsedTimeBeforeCurrentSession(resolvedElapsedTimeBeforeSession);
      setCurrentTotalElapsedTime(resolvedElapsedTimeBeforeSession); 
      
      const tempHourlyWage = parseFloat(resolvedHourlyWageStr);
      const initialEarnings = !isNaN(tempHourlyWage) && tempHourlyWage > 0 ? (tempHourlyWage / 3600) * resolvedElapsedTimeBeforeSession : 0;
      setCurrentEarnings(initialEarnings);
      
      setLastAnimationTimestamp(resolvedLastAnimationTimestamp);
      setLastAnimationEarningsCheck(resolvedLastAnimationEarningsCheck);

      // Auto-start logic
      const finalHourlyWage = parseFloat(resolvedHourlyWageStr);
      const finalWorkDuration = parseFloat(resolvedWorkDurationStr);

      if (shouldResumeRunning && resumeSessionStartTime !== null) {
        // Resume a previously running session
        setSessionStartTime(resumeSessionStartTime);
        setIsRunning(true);
      } else if (!isNaN(finalHourlyWage) && finalHourlyWage > 0 && !isNaN(finalWorkDuration) && finalWorkDuration > 0) {
        // Auto-start if config is valid (either from localStorage or defaults if localStorage failed/empty)
        // and it wasn't a session to be resumed.
        setSessionStartTime(Date.now());
        setIsRunning(true);
      }
      // If none of the above, it remains paused (isRunning is false by default).
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount. Dependencies are intentionally limited.


  // Save to localStorage whenever relevant state changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dataToSave: WageWatcherPersistentData = {
        hourlyWage: parseFloat(inputs.hourlyWage) || DEFAULT_HOURLY_WAGE,
        workDurationHours: parseFloat(inputs.workDurationHours) || DEFAULT_WORK_DURATION_HOURS,
        celebrationThreshold: parseFloat(inputs.celebrationThreshold) || DEFAULT_CELEBRATION_THRESHOLD,
        isRunning,
        elapsedTimeBeforeCurrentSession,
        sessionStartTime: sessionStartTime || undefined, // Store null as undefined
        lastAnimationEarningsCheck,
        lastAnimationTimestamp,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
    }
  }, [inputs, isRunning, elapsedTimeBeforeCurrentSession, sessionStartTime, lastAnimationEarningsCheck, lastAnimationTimestamp]);

  // Timer logic
  useEffect(() => {
    let animationFrameId: number;
    if (isRunning && sessionStartTime) {
      const tick = () => {
        const now = Date.now();
        const currentSessionDuration = (now - sessionStartTime) / 1000; // in seconds
        const totalElapsedTime = elapsedTimeBeforeCurrentSession + currentSessionDuration;
        
        setCurrentTotalElapsedTime(totalElapsedTime);

        const numericHourlyWage = parseFloat(inputs.hourlyWage);
        if (!isNaN(numericHourlyWage) && numericHourlyWage > 0) {
          const newEarnings = (numericHourlyWage / 3600) * totalElapsedTime;
          setCurrentEarnings(newEarnings);

          const numericThreshold = parseFloat(inputs.celebrationThreshold);
          if (!isNaN(numericThreshold) && numericThreshold > 0) {
            const prevMilestone = Math.floor(lastAnimationEarningsCheck / numericThreshold);
            const currentMilestone = Math.floor(newEarnings / numericThreshold);

            if (currentMilestone > prevMilestone && newEarnings > lastAnimationEarningsCheck) {
              const aiInput: AnimationOrchestratorInput = {
                currentEarnings: newEarnings,
                lastAnimationTimestamp: lastAnimationTimestamp,
                threshold: numericThreshold,
              };
              shouldAnimate(aiInput).then(response => {
                if (response.triggerAnimation) {
                  setShowCelebration(true);
                  setLastAnimationTimestamp(Date.now());
                }
              }).catch(err => {
                console.error("AI animation check failed:", err);
                toast({ title: "Animation Check Error", description: "Could not determine animation status.", variant: "destructive" });
              });
              setLastAnimationEarningsCheck(newEarnings);
            }
          }
        }
        animationFrameId = requestAnimationFrame(tick);
      };
      animationFrameId = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isRunning, sessionStartTime, inputs.hourlyWage, inputs.celebrationThreshold, elapsedTimeBeforeCurrentSession, lastAnimationTimestamp, lastAnimationEarningsCheck, toast]);

  const startTracking = useCallback(() => {
    const numericHourlyWage = parseFloat(inputs.hourlyWage);
    const numericWorkDuration = parseFloat(inputs.workDurationHours);
    if (isNaN(numericHourlyWage) || numericHourlyWage <= 0 || isNaN(numericWorkDuration) || numericWorkDuration <= 0) {
      toast({ title: "Invalid Input", description: "Please enter a valid positive hourly wage and work duration.", variant: "destructive"});
      return;
    }
    // If starting fresh or after a pause where sessionStartTime was nullified
    if (!sessionStartTime) {
        setSessionStartTime(Date.now());
    }
    // If it was paused and sessionStartTime is null, elapsedTimeBeforeCurrentSession is already up-to-date.
    // If it was running, this call might be redundant but harmless.
    // The key is that sessionStartTime must be set for the timer useEffect.
    setIsRunning(true);
  }, [inputs.hourlyWage, inputs.workDurationHours, toast, sessionStartTime]);

  const stopTracking = useCallback(() => {
    if (sessionStartTime && isRunning) { // Ensure it's actually running
      const currentSessionDuration = (Date.now() - sessionStartTime) / 1000;
      setElapsedTimeBeforeCurrentSession(prev => prev + currentSessionDuration);
    }
    setSessionStartTime(null); // Important to nullify for pause logic
    setIsRunning(false);
  }, [sessionStartTime, isRunning]);

  const resetTracking = useCallback(() => {
    setIsRunning(false);
    setSessionStartTime(null);
    setElapsedTimeBeforeCurrentSession(0);
    setCurrentTotalElapsedTime(0);
    setCurrentEarnings(0);
    setShowCelebration(false);
    setLastAnimationEarningsCheck(0);
    setLastAnimationTimestamp(0);
    setInputs({ // Reset inputs to default
        hourlyWage: DEFAULT_HOURLY_WAGE.toString(),
        workDurationHours: DEFAULT_WORK_DURATION_HOURS.toString(),
        celebrationThreshold: DEFAULT_CELEBRATION_THRESHOLD.toString(),
    });
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    toast({ title: "Tracker Reset", description: "All data has been cleared." });
  }, [toast]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'hourlyWage' || name === 'workDurationHours' || name === 'celebrationThreshold') {
        if (value === "" || /^\d*\.?\d*$/.test(value)) {
            setInputs(prev => ({ ...prev, [name]: value }));
        }
    } else {
        setInputs(prev => ({ ...prev, [name]: value }));
    }

    if (!isRunning) {
        const currentHourlyWage = name === 'hourlyWage' ? parseFloat(value) : parseFloat(inputs.hourlyWage);
        const currentElapsedTime = currentTotalElapsedTime; // Use the state that reflects total time including current non-running session
        if (!isNaN(currentHourlyWage) && currentHourlyWage > 0) {
             setCurrentEarnings((currentHourlyWage / 3600) * currentElapsedTime);
        } else if (currentHourlyWage <=0 || value === "") { // If wage becomes invalid or empty, earnings should be 0 if not running
             setCurrentEarnings(0);
        }
    }
  };

  const numericHourlyWage = parseFloat(inputs.hourlyWage) || 0;
  const earningsPerSecond = numericHourlyWage > 0 ? numericHourlyWage / 3600 : 0;
  const numericWorkDurationHours = parseFloat(inputs.workDurationHours) || 0;
  const totalExpectedEarnings = numericHourlyWage * numericWorkDurationHours;
  const progress = totalExpectedEarnings > 0 ? Math.min((currentEarnings / totalExpectedEarnings) * 100, 100) : 0;

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  const elapsedTimeFormatted = formatTime(currentTotalElapsedTime);

  return {
    inputs,
    handleInputChange,
    isRunning,
    startTracking,
    stopTracking,
    resetTracking,
    displayData: {
      currentEarnings,
      elapsedTimeFormatted,
      elapsedTimeInSeconds: currentTotalElapsedTime,
      earningsPerSecond,
      progress,
      totalExpectedEarnings,
    },
    showCelebration,
    setShowCelebration,
  };
}

