
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

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDataRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedDataRaw) {
        try {
          const savedData: WageWatcherPersistentData = JSON.parse(savedDataRaw);
          setInputs({
            hourlyWage: savedData.hourlyWage.toString(),
            workDurationHours: savedData.workDurationHours.toString(),
            celebrationThreshold: savedData.celebrationThreshold.toString(),
          });
          setElapsedTimeBeforeCurrentSession(savedData.elapsedTimeBeforeCurrentSession || 0);
          setCurrentTotalElapsedTime(savedData.elapsedTimeBeforeCurrentSession || 0); // Initialize displayed elapsed time

          const initialEarnings = (parseFloat(savedData.hourlyWage.toString()) / 3600) * (savedData.elapsedTimeBeforeCurrentSession || 0);
          setCurrentEarnings(initialEarnings);
          
          setLastAnimationTimestamp(savedData.lastAnimationTimestamp || 0);
          setLastAnimationEarningsCheck(savedData.lastAnimationEarningsCheck || 0);

          if (savedData.isRunning && savedData.sessionStartTime) {
            setSessionStartTime(savedData.sessionStartTime);
            setIsRunning(true);
          }
        } catch (error) {
          console.error("Failed to parse saved data from localStorage", error);
          localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
      }
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dataToSave: WageWatcherPersistentData = {
        hourlyWage: parseFloat(inputs.hourlyWage) || DEFAULT_HOURLY_WAGE,
        workDurationHours: parseFloat(inputs.workDurationHours) || DEFAULT_WORK_DURATION_HOURS,
        celebrationThreshold: parseFloat(inputs.celebrationThreshold) || DEFAULT_CELEBRATION_THRESHOLD,
        isRunning,
        elapsedTimeBeforeCurrentSession,
        sessionStartTime: sessionStartTime || undefined,
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
        const currentSessionDuration = (now - sessionStartTime) / 1000;
        const totalElapsedTime = elapsedTimeBeforeCurrentSession + currentSessionDuration;
        
        setCurrentTotalElapsedTime(totalElapsedTime);

        const numericHourlyWage = parseFloat(inputs.hourlyWage);
        if (!isNaN(numericHourlyWage)) {
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
    setSessionStartTime(Date.now());
    setIsRunning(true);
  }, [inputs.hourlyWage, inputs.workDurationHours, toast]);

  const stopTracking = useCallback(() => {
    if (sessionStartTime) {
      const currentSessionDuration = (Date.now() - sessionStartTime) / 1000;
      setElapsedTimeBeforeCurrentSession(prev => prev + currentSessionDuration);
    }
    setSessionStartTime(null);
    setIsRunning(false);
  }, [sessionStartTime]);

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
    // Allow only numbers and a single decimal point for numeric fields
    if (name === 'hourlyWage' || name === 'workDurationHours' || name === 'celebrationThreshold') {
        if (value === "" || /^\d*\.?\d*$/.test(value)) {
            setInputs(prev => ({ ...prev, [name]: value }));
        }
    } else {
        setInputs(prev => ({ ...prev, [name]: value }));
    }


    if (!isRunning) {
        const currentHourlyWage = name === 'hourlyWage' ? parseFloat(value) : parseFloat(inputs.hourlyWage);
        if (!isNaN(currentHourlyWage)) {
             setCurrentEarnings((currentHourlyWage / 3600) * currentTotalElapsedTime);
        }
    }
  };

  const numericHourlyWage = parseFloat(inputs.hourlyWage) || 0;
  const earningsPerSecond = numericHourlyWage / 3600;
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
