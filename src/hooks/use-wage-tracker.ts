
'use client';

import { useState, useEffect, useCallback } from 'react';
import { shouldAnimate } from '@/ai/flows/animation-orchestrator';
import type { AnimationOrchestratorInput } from '@/ai/flows/animation-orchestrator';
import { useToast } from '@/hooks/use-toast';

const LOCAL_STORAGE_KEY = 'wageWatcherDataV3'; // V3 for new time-based schedule logic

const DEFAULT_HOURLY_WAGE = 20;
const DEFAULT_WORK_START_TIME = "09:00";
const DEFAULT_WORK_END_TIME = "17:00";
const DEFAULT_CELEBRATION_THRESHOLD = 100;

type WageWatcherPersistentData = {
  hourlyWage: number;
  workStartTime: string;
  workEndTime: string;
  celebrationThreshold: number;
  // isRunning & sessionStartTime are not strictly needed for restoring schedule-based state,
  // but useful if we want to preserve manual pause/resume state across sessions without schedule override.
  // For now, schedule always dictates on load.
  isRunning: boolean; // Saved state if user explicitly paused/played.
  elapsedTimeBeforeCurrentSession: number; // Stores total elapsed time when timer is manually paused.
  sessionStartTime?: number; // Timestamp when current manual session started.
  lastAnimationEarningsCheck: number;
  lastAnimationTimestamp: number;
};

const getTimestampForToday = (timeStr: string, baseDate: Date = new Date()): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
        // Fallback to current time on parse error, or handle more gracefully
        return new Date(baseDate).setHours(0,0,0,0); 
    }
    const date = new Date(baseDate);
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
};


export function useWageTracker() {
  const { toast } = useToast();

  const [inputs, setInputs] = useState({
    hourlyWage: DEFAULT_HOURLY_WAGE.toString(),
    workStartTime: DEFAULT_WORK_START_TIME,
    workEndTime: DEFAULT_WORK_END_TIME,
    celebrationThreshold: DEFAULT_CELEBRATION_THRESHOLD.toString(),
  });

  const [isRunning, setIsRunning] = useState(false);
  // elapsedTimeBeforeCurrentSession stores manually accumulated time during pauses within a day.
  // It's reset if the app reloads and recalculates based on today's schedule.
  const [elapsedTimeBeforeCurrentSession, setElapsedTimeBeforeCurrentSession] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);

  const [currentTotalElapsedTime, setCurrentTotalElapsedTime] = useState(0);
  const [currentEarnings, setCurrentEarnings] = useState(0);

  const [showCelebration, setShowCelebration] = useState(false);
  const [lastAnimationEarningsCheck, setLastAnimationEarningsCheck] = useState(0);
  const [lastAnimationTimestamp, setLastAnimationTimestamp] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDataRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      let initialSettings = {
        hourlyWage: DEFAULT_HOURLY_WAGE.toString(),
        workStartTime: DEFAULT_WORK_START_TIME,
        workEndTime: DEFAULT_WORK_END_TIME,
        celebrationThreshold: DEFAULT_CELEBRATION_THRESHOLD.toString(),
      };
      
      let savedElapsedTimeBeforeSession = 0;
      // isRunning and sessionStartTime from storage are for potential future use if we want to restore exact manual pause state.
      // For now, they are mostly informational for saving.
      // let savedIsRunning = false; 
      // let savedSessionStartTime: number | undefined = undefined;


      if (savedDataRaw) {
        try {
          const savedData: WageWatcherPersistentData = JSON.parse(savedDataRaw);
          initialSettings = {
            hourlyWage: (savedData.hourlyWage || DEFAULT_HOURLY_WAGE).toString(),
            workStartTime: savedData.workStartTime || DEFAULT_WORK_START_TIME,
            workEndTime: savedData.workEndTime || DEFAULT_WORK_END_TIME,
            celebrationThreshold: (savedData.celebrationThreshold || DEFAULT_CELEBRATION_THRESHOLD).toString(),
          };
          setLastAnimationTimestamp(savedData.lastAnimationTimestamp || 0);
          setLastAnimationEarningsCheck(savedData.lastAnimationEarningsCheck || 0);
          savedElapsedTimeBeforeSession = savedData.elapsedTimeBeforeCurrentSession || 0;
          // savedIsRunning = savedData.isRunning;
          // savedSessionStartTime = savedData.sessionStartTime;
        } catch (error) {
          console.error("Failed to parse saved data from localStorage", error);
          localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
      }
      setInputs(initialSettings);

      // Calculate state based on today's schedule and current time
      const now = new Date();
      const todayBaseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const todayWorkStartTimestamp = getTimestampForToday(initialSettings.workStartTime, todayBaseDate);
      let todayWorkEndTimestamp = getTimestampForToday(initialSettings.workEndTime, todayBaseDate);

      // Basic overnight check: if end time is earlier than start time, assume it's for the next morning.
      if (todayWorkEndTimestamp <= todayWorkStartTimestamp) {
        const nextDayBaseDate = new Date(todayBaseDate);
        nextDayBaseDate.setDate(todayBaseDate.getDate() + 1);
        todayWorkEndTimestamp = getTimestampForToday(initialSettings.workEndTime, nextDayBaseDate);
      }
      
      const currentTimestamp = now.getTime();
      let newIsRunning = false;
      let newSessionStartTime: number | null = null;
      let newCurrentTotalElapsedTime = 0;
      let newElapsedTimeBeforeCurrentSession = 0;


      if (currentTimestamp >= todayWorkStartTimestamp && currentTimestamp < todayWorkEndTimestamp) {
        newIsRunning = true;
        newSessionStartTime = todayWorkStartTimestamp; // Effective start of tracking for today
        newElapsedTimeBeforeCurrentSession = 0; // Reset for schedule-based calculation
        newCurrentTotalElapsedTime = (currentTimestamp - todayWorkStartTimestamp) / 1000;
      } else if (currentTimestamp >= todayWorkEndTimestamp) { // After work hours
        newIsRunning = false;
        newSessionStartTime = null;
        const scheduledDurationToday = (todayWorkEndTimestamp - todayWorkStartTimestamp) / 1000;
        newCurrentTotalElapsedTime = scheduledDurationToday > 0 ? scheduledDurationToday : 0;
        newElapsedTimeBeforeCurrentSession = newCurrentTotalElapsedTime; // Store completed work
      } else { // Before work hours
        newIsRunning = false;
        newSessionStartTime = null;
        newCurrentTotalElapsedTime = 0;
        newElapsedTimeBeforeCurrentSession = 0;
      }

      // If user had manually paused with some accumulated time (savedElapsedTimeBeforeSession)
      // AND the app is loading outside active schedule, restore that paused state.
      // Otherwise, the schedule dictates.
      if (!newIsRunning && savedElapsedTimeBeforeSession > 0 && currentTimestamp < todayWorkStartTimestamp) {
          // If it's before work today, and there was a saved manual pause, show that.
          // This behavior might be complex; for now, schedule mostly wins.
          // Sticking to simpler "today's schedule rules on load" for now.
          // So, newElapsedTimeBeforeCurrentSession as determined by schedule is fine.
      }


      setIsRunning(newIsRunning);
      setSessionStartTime(newSessionStartTime);
      setCurrentTotalElapsedTime(newCurrentTotalElapsedTime);
      setElapsedTimeBeforeCurrentSession(newElapsedTimeBeforeCurrentSession); // This is key for pause/resume logic

      const hourlyWageNum = parseFloat(initialSettings.hourlyWage);
      if (!isNaN(hourlyWageNum) && hourlyWageNum > 0) {
        setCurrentEarnings((hourlyWageNum / 3600) * newCurrentTotalElapsedTime);
      } else {
        setCurrentEarnings(0);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dataToSave: WageWatcherPersistentData = {
        hourlyWage: parseFloat(inputs.hourlyWage) || DEFAULT_HOURLY_WAGE,
        workStartTime: inputs.workStartTime,
        workEndTime: inputs.workEndTime,
        celebrationThreshold: parseFloat(inputs.celebrationThreshold) || DEFAULT_CELEBRATION_THRESHOLD,
        isRunning, // Current actual running state
        elapsedTimeBeforeCurrentSession, // Accumulated time from manual pauses
        sessionStartTime: sessionStartTime || undefined,
        lastAnimationEarningsCheck,
        lastAnimationTimestamp,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
    }
  }, [inputs, isRunning, elapsedTimeBeforeCurrentSession, sessionStartTime, lastAnimationEarningsCheck, lastAnimationTimestamp]);

  useEffect(() => {
    let animationFrameId: number;
    if (isRunning && sessionStartTime) {
      const tick = () => {
        const now = Date.now();
        // If sessionStartTime is from today's schedule, currentSessionDuration is time since schedule start
        // If sessionStartTime is from manual start/resume, it's time since that manual action
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
    const now = new Date();
    const todayBaseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayWorkStartTimestamp = getTimestampForToday(inputs.workStartTime, todayBaseDate);
    
    if (isNaN(numericHourlyWage) || numericHourlyWage <= 0) {
      toast({ title: "Invalid Input", description: "Please enter a valid positive hourly wage.", variant: "destructive"});
      return;
    }

    // If starting manually, it overrides the schedule-based state for the current session.
    // elapsedTimeBeforeCurrentSession holds time accumulated from previous manual pauses *today*.
    setSessionStartTime(Date.now()); // Start timing from *now* for this manual session segment
    setIsRunning(true);
    
  }, [inputs.hourlyWage, inputs.workStartTime, toast]);

  const stopTracking = useCallback(() => {
    if (sessionStartTime && isRunning) {
      const currentSessionDuration = (Date.now() - sessionStartTime) / 1000;
      const newTotalElapsed = elapsedTimeBeforeCurrentSession + currentSessionDuration;
      setElapsedTimeBeforeCurrentSession(newTotalElapsed); // Accumulate time up to this pause
      setCurrentTotalElapsedTime(newTotalElapsed); // Ensure display is updated
    }
    setSessionStartTime(null);
    setIsRunning(false);
  }, [sessionStartTime, isRunning, elapsedTimeBeforeCurrentSession]);

  const resetTracking = useCallback(() => {
    setIsRunning(false);
    setSessionStartTime(null);
    setElapsedTimeBeforeCurrentSession(0);
    setCurrentTotalElapsedTime(0);
    setCurrentEarnings(0);
    setShowCelebration(false);
    setLastAnimationEarningsCheck(0);
    setLastAnimationTimestamp(0);
    setInputs({
        hourlyWage: DEFAULT_HOURLY_WAGE.toString(),
        workStartTime: DEFAULT_WORK_START_TIME,
        workEndTime: DEFAULT_WORK_END_TIME,
        celebrationThreshold: DEFAULT_CELEBRATION_THRESHOLD.toString(),
    });
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    toast({ title: "Tracker Reset", description: "All data has been cleared." });
    // After reset, useEffect for loading will run and set state based on defaults and current time
    // For an immediate UI update reflecting reset to "before work" state:
    const now = new Date();
    const todayBaseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayWorkStartTimestamp = getTimestampForToday(DEFAULT_WORK_START_TIME, todayBaseDate);
    if (now.getTime() < todayWorkStartTimestamp) {
        setIsRunning(false);
        setCurrentTotalElapsedTime(0);
        setCurrentEarnings(0);
        setElapsedTimeBeforeCurrentSession(0);
    } // else the main load useEffect will handle it on next render cycle.

  }, [toast]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let newInputs = { ...inputs, [name]: value };
    setInputs(newInputs);

    // If not running, recalculate earnings based on new inputs and currentTotalElapsedTime
    // (which might be 0 if before work, or full duration if after work, or manually paused time)
    if (!isRunning) {
        const currentHourlyWage = name === 'hourlyWage' ? parseFloat(value) : parseFloat(newInputs.hourlyWage);
        // Recalculate total expected based on potentially new start/end times
        // For current earnings, use currentTotalElapsedTime
        if (!isNaN(currentHourlyWage) && currentHourlyWage > 0) {
             setCurrentEarnings((currentHourlyWage / 3600) * currentTotalElapsedTime);
        } else if (currentHourlyWage <=0 || (name === 'hourlyWage' && value === "")) {
             setCurrentEarnings(0);
        }
        // If times change while not running, we might need to re-evaluate currentTotalElapsedTime too.
        // The load useEffect handles initial state. This handler is for changes while page is active.
        // For simplicity, if time inputs change while paused, the earnings reflect the currentTotalElapsedTime
        // with new wage. The schedule's impact on currentTotalElapsedTime updates on next load/start.
    }
  };

  const numericHourlyWage = parseFloat(inputs.hourlyWage) || 0;
  const earningsPerSecond = numericHourlyWage > 0 ? numericHourlyWage / 3600 : 0;
  
  const todayBaseForDisplay = new Date();
  todayBaseForDisplay.setHours(0,0,0,0);
  const workStartTimestampForDisplay = getTimestampForToday(inputs.workStartTime, todayBaseForDisplay);
  let workEndTimestampForDisplay = getTimestampForToday(inputs.workEndTime, todayBaseForDisplay);
  if (workEndTimestampForDisplay <= workStartTimestampForDisplay) {
      const tomorrowBase = new Date(todayBaseForDisplay);
      tomorrowBase.setDate(todayBaseForDisplay.getDate() + 1);
      workEndTimestampForDisplay = getTimestampForToday(inputs.workEndTime, tomorrowBase);
  }
  const workDurationInSeconds = (workEndTimestampForDisplay - workStartTimestampForDisplay) / 1000;
  const totalExpectedEarnings = numericHourlyWage * (workDurationInSeconds > 0 ? workDurationInSeconds / 3600 : 0);

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
