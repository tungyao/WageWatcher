
'use client';

import { useState, useEffect, useCallback } from 'react';
import { shouldAnimate } from '@/ai/flows/animation-orchestrator';
import type { AnimationOrchestratorInput } from '@/ai/flows/animation-orchestrator';
import { useToast } from '@/hooks/use-toast';

const LOCAL_STORAGE_KEY = 'wageWatcherDataV4'; 

const DEFAULT_MONTHLY_SALARY = 5000;
const DEFAULT_WORK_DAYS_PER_MONTH = 22;
const DEFAULT_WORK_START_TIME = "09:00";
const DEFAULT_WORK_END_TIME = "17:00";
const DEFAULT_CELEBRATION_THRESHOLD = 100;

export type WageTrackerInputs = {
  monthlySalary: string;
  workDaysPerMonth: string;
  workStartTime: string;
  workEndTime: string;
  celebrationThreshold: string;
};

type WageWatcherPersistentData = {
  monthlySalary: number;
  workDaysPerMonth: number;
  workStartTime: string;
  workEndTime: string;
  celebrationThreshold: number;
  isRunning: boolean;
  elapsedTimeBeforeCurrentSession: number;
  sessionStartTime?: number;
  lastAnimationEarningsCheck: number;
  lastAnimationTimestamp: number;
};

const getTimestampForToday = (timeStr: string, baseDate: Date = new Date()): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
        // Return a clearly invalid or very early timestamp if parsing fails
        // or handle error appropriately. For now, set to start of baseDate.
        return new Date(baseDate).setHours(0,0,0,0); 
    }
    const date = new Date(baseDate);
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
};


export function useWageTracker() {
  const { toast } = useToast();

  const [inputs, setInputs] = useState<WageTrackerInputs>({
    monthlySalary: DEFAULT_MONTHLY_SALARY.toString(),
    workDaysPerMonth: DEFAULT_WORK_DAYS_PER_MONTH.toString(),
    workStartTime: DEFAULT_WORK_START_TIME,
    workEndTime: DEFAULT_WORK_END_TIME,
    celebrationThreshold: DEFAULT_CELEBRATION_THRESHOLD.toString(),
  });

  const [isRunning, setIsRunning] = useState(false);
  const [elapsedTimeBeforeCurrentSession, setElapsedTimeBeforeCurrentSession] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);

  const [currentTotalElapsedTime, setCurrentTotalElapsedTime] = useState(0);
  const [currentEarnings, setCurrentEarnings] = useState(0);

  const [showCelebration, setShowCelebration] = useState(false);
  const [lastAnimationEarningsCheck, setLastAnimationEarningsCheck] = useState(0);
  const [lastAnimationTimestamp, setLastAnimationTimestamp] = useState(0);

  const reinitializeTrackerState = useCallback((currentSettings: WageTrackerInputs, currentIsRunningState?: boolean) => {
      const now = new Date();
      const todayBaseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const todayWorkStartTimestamp = getTimestampForToday(currentSettings.workStartTime, todayBaseDate);
      let todayWorkEndTimestamp = getTimestampForToday(currentSettings.workEndTime, todayBaseDate);

      if (todayWorkEndTimestamp <= todayWorkStartTimestamp) { // Handles overnight shifts or invalid end time
        const nextDayBaseDate = new Date(todayBaseDate);
        nextDayBaseDate.setDate(todayBaseDate.getDate() + 1);
        todayWorkEndTimestamp = getTimestampForToday(currentSettings.workEndTime, nextDayBaseDate);
      }
      
      const currentTimestamp = now.getTime();
      let newIsRunning = currentIsRunningState !== undefined ? currentIsRunningState : false;
      let newSessionStartTime: number | null = null;
      let newCurrentTotalElapsedTime = 0;
      let newElapsedTimeBeforeCurrentSession = 0;

      if (currentTimestamp >= todayWorkStartTimestamp && currentTimestamp < todayWorkEndTimestamp) {
        // Within scheduled work hours
        newIsRunning = true; // Should be running based on schedule
        newSessionStartTime = todayWorkStartTimestamp; // Session starts at beginning of work day for calculation
        newCurrentTotalElapsedTime = (currentTimestamp - todayWorkStartTimestamp) / 1000;
        newElapsedTimeBeforeCurrentSession = 0; // Reset as we are within the scheduled day
      } else if (currentTimestamp >= todayWorkEndTimestamp) { 
        // After scheduled work hours
        newIsRunning = false;
        const scheduledDurationToday = (todayWorkEndTimestamp - todayWorkStartTimestamp) / 1000;
        newCurrentTotalElapsedTime = scheduledDurationToday > 0 ? scheduledDurationToday : 0;
        newElapsedTimeBeforeCurrentSession = newCurrentTotalElapsedTime; // Full day's elapsed time
      } else { 
        // Before scheduled work hours
        newIsRunning = false;
        newCurrentTotalElapsedTime = 0;
        newElapsedTimeBeforeCurrentSession = 0;
      }

      // If manual stop happened, preserve it.
      // However, for import/initial load, we rely on schedule.
      // For manual setting changes, `isRunning` is preserved from its current state.
      // This part might need refinement based on desired behavior for manual changes vs. load.
      // For `loadSettings`, we are effectively resetting the "running" state based purely on schedule.
      if (currentIsRunningState !== undefined) { // from manual start/stop/change
          if(!currentIsRunningState) { // if it was manually stopped
            newIsRunning = false;
            newSessionStartTime = null;
            // Keep newCurrentTotalElapsedTime from above if it was after hours,
            // or use the existing currentTotalElapsedTime if stopped mid-day.
            // For simplicity, use the one from above, assuming it's more "current"
          } else { // if it was manually started
             newIsRunning = true;
             // if it's started outside schedule, sessionStartTime should be now, not work start
             if(sessionStartTime === null || currentTimestamp < todayWorkStartTimestamp || currentTimestamp >= todayWorkEndTimestamp) {
                // If starting manually outside schedule, or if schedule changed
                // and tracker was running based on old schedule.
                newSessionStartTime = Date.now(); 
                newCurrentTotalElapsedTime = elapsedTimeBeforeCurrentSession; // Start from previously accumulated
             } else {
                // Resuming within schedule, base on schedule start + accumulated
                newSessionStartTime = sessionStartTime || Date.now(); // Keep existing if valid
                newCurrentTotalElapsedTime = elapsedTimeBeforeCurrentSession + ((Date.now() - (sessionStartTime || Date.now())) / 1000);
             }
          }
      }


      setIsRunning(newIsRunning);
      setSessionStartTime(newSessionStartTime);
      setCurrentTotalElapsedTime(newCurrentTotalElapsedTime);
      setElapsedTimeBeforeCurrentSession(newElapsedTimeBeforeCurrentSession); 

      const monthlySalaryNum = parseFloat(currentSettings.monthlySalary);
      const workDaysNum = parseInt(currentSettings.workDaysPerMonth, 10);

      if (!isNaN(monthlySalaryNum) && monthlySalaryNum > 0 && !isNaN(workDaysNum) && workDaysNum > 0) {
        const dailySalary = monthlySalaryNum / workDaysNum;
        const scheduledDurationTodaySec = (todayWorkEndTimestamp - todayWorkStartTimestamp) / 1000;
        if (scheduledDurationTodaySec > 0) {
          const earningsRateToday = dailySalary / scheduledDurationTodaySec;
          setCurrentEarnings(earningsRateToday * newCurrentTotalElapsedTime);
        } else {
          setCurrentEarnings(0);
        }
      } else {
        setCurrentEarnings(0);
      }
  }, [setIsRunning, setSessionStartTime, setCurrentTotalElapsedTime, setElapsedTimeBeforeCurrentSession, setCurrentEarnings, sessionStartTime, elapsedTimeBeforeCurrentSession]);


  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDataRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      let initialSettings = {
        monthlySalary: DEFAULT_MONTHLY_SALARY.toString(),
        workDaysPerMonth: DEFAULT_WORK_DAYS_PER_MONTH.toString(),
        workStartTime: DEFAULT_WORK_START_TIME,
        workEndTime: DEFAULT_WORK_END_TIME,
        celebrationThreshold: DEFAULT_CELEBRATION_THRESHOLD.toString(),
      };
      
      if (savedDataRaw) {
        try {
          const savedData: WageWatcherPersistentData = JSON.parse(savedDataRaw);
          initialSettings = {
            monthlySalary: (savedData.monthlySalary || DEFAULT_MONTHLY_SALARY).toString(),
            workDaysPerMonth: (savedData.workDaysPerMonth || DEFAULT_WORK_DAYS_PER_MONTH).toString(),
            workStartTime: savedData.workStartTime || DEFAULT_WORK_START_TIME,
            workEndTime: savedData.workEndTime || DEFAULT_WORK_END_TIME,
            celebrationThreshold: (savedData.celebrationThreshold || DEFAULT_CELEBRATION_THRESHOLD).toString(),
          };
          setLastAnimationTimestamp(savedData.lastAnimationTimestamp || 0);
          setLastAnimationEarningsCheck(savedData.lastAnimationEarningsCheck || 0);
          // Note: isRunning, sessionStartTime, elapsedTimeBeforeCurrentSession from savedData are ignored
          // in favor of recalculation based on current time and schedule.
        } catch (error) {
          console.error("Failed to parse saved data from localStorage", error);
          localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear corrupted data
        }
      }
      setInputs(initialSettings);
      reinitializeTrackerState(initialSettings); // Initialize based on schedule
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount


  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dataToSave: WageWatcherPersistentData = {
        monthlySalary: parseFloat(inputs.monthlySalary) || DEFAULT_MONTHLY_SALARY,
        workDaysPerMonth: parseInt(inputs.workDaysPerMonth, 10) || DEFAULT_WORK_DAYS_PER_MONTH,
        workStartTime: inputs.workStartTime,
        workEndTime: inputs.workEndTime,
        celebrationThreshold: parseFloat(inputs.celebrationThreshold) || DEFAULT_CELEBRATION_THRESHOLD,
        isRunning, 
        elapsedTimeBeforeCurrentSession, 
        sessionStartTime: sessionStartTime || undefined, // Store null as undefined for cleaner JSON
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
        const currentSessionDuration = (now - sessionStartTime) / 1000; // Duration of this specific "run"
        const totalElapsedTime = elapsedTimeBeforeCurrentSession + currentSessionDuration;
        
        setCurrentTotalElapsedTime(totalElapsedTime);

        const numericMonthlySalary = parseFloat(inputs.monthlySalary);
        const numericWorkDaysPerMonth = parseInt(inputs.workDaysPerMonth, 10);

        if (!isNaN(numericMonthlySalary) && numericMonthlySalary > 0 && !isNaN(numericWorkDaysPerMonth) && numericWorkDaysPerMonth > 0) {
          const dailySalary = numericMonthlySalary / numericWorkDaysPerMonth;
          
          const effectiveBaseDate = new Date(sessionStartTime); 
          const todayWorkStartTs = getTimestampForToday(inputs.workStartTime, effectiveBaseDate);
          let todayWorkEndTs = getTimestampForToday(inputs.workEndTime, effectiveBaseDate);
          if (todayWorkEndTs <= todayWorkStartTs) {
            const nextDayBase = new Date(effectiveBaseDate);
            nextDayBase.setDate(effectiveBaseDate.getDate() + 1);
            todayWorkEndTs = getTimestampForToday(inputs.workEndTime, nextDayBase);
          }
          const scheduledDurationSecsToday = (todayWorkEndTs - todayWorkStartTs) / 1000;

          if (scheduledDurationSecsToday > 0) {
            const earningsRateForToday = dailySalary / scheduledDurationSecsToday;
            // Earnings are calculated based on total elapsed time for the day,
            // which might be different from scheduled time if manually started/stopped.
            // The totalElapsedTime reflects the actual tracked time.
            const newEarnings = earningsRateForToday * totalElapsedTime;
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
                  toast({ title: "动画检查错误", description: "无法确定动画状态。", variant: "destructive" });
                });
                setLastAnimationEarningsCheck(newEarnings);
              }
            }
          } else {
             setCurrentEarnings(0); // No earnings if scheduled duration is zero or negative
          }
        }
        animationFrameId = requestAnimationFrame(tick);
      };
      animationFrameId = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isRunning, sessionStartTime, inputs, elapsedTimeBeforeCurrentSession, lastAnimationTimestamp, lastAnimationEarningsCheck, toast]);

  const startTracking = useCallback(() => {
    const numericMonthlySalary = parseFloat(inputs.monthlySalary);
    const numericWorkDaysPerMonth = parseInt(inputs.workDaysPerMonth, 10);
    
    if (isNaN(numericMonthlySalary) || numericMonthlySalary <= 0 || isNaN(numericWorkDaysPerMonth) || numericWorkDaysPerMonth <= 0) {
      toast({ title: "无效输入", description: "请输入有效的月薪和工作天数。", variant: "destructive"});
      return;
    }
    
    const now = Date.now();
    setSessionStartTime(now); // Current time as session start
    // elapsedTimeBeforeCurrentSession remains as is, new session adds to it
    setIsRunning(true);
    
  }, [inputs, toast]);

  const stopTracking = useCallback(() => {
    if (sessionStartTime && isRunning) {
      const currentSessionDuration = (Date.now() - sessionStartTime) / 1000;
      const newTotalElapsed = elapsedTimeBeforeCurrentSession + currentSessionDuration;
      setElapsedTimeBeforeCurrentSession(newTotalElapsed); 
      setCurrentTotalElapsedTime(newTotalElapsed); 
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
    const defaultSettings = {
        monthlySalary: DEFAULT_MONTHLY_SALARY.toString(),
        workDaysPerMonth: DEFAULT_WORK_DAYS_PER_MONTH.toString(),
        workStartTime: DEFAULT_WORK_START_TIME,
        workEndTime: DEFAULT_WORK_END_TIME,
        celebrationThreshold: DEFAULT_CELEBRATION_THRESHOLD.toString(),
    };
    setInputs(defaultSettings);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    toast({ title: "追踪器已重置", description: "所有数据已被清除。" });
    
    // After reset, re-evaluate based on default schedule.
    reinitializeTrackerState(defaultSettings);

  }, [toast, reinitializeTrackerState]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const newInputs = { ...inputs, [name]: value };
    setInputs(newInputs);

    // If not running, recalculate displayed earnings based on new inputs and currentTotalElapsedTime
    if (!isRunning) {
        const monthlySalaryNum = name === 'monthlySalary' ? parseFloat(value) : parseFloat(newInputs.monthlySalary);
        const workDaysNum = name === 'workDaysPerMonth' ? parseInt(value, 10) : parseInt(newInputs.workDaysPerMonth, 10);

        if (!isNaN(monthlySalaryNum) && monthlySalaryNum > 0 && !isNaN(workDaysNum) && workDaysNum > 0) {
            const dailySalary = monthlySalaryNum / workDaysNum;
            
            const todayBase = new Date(); // Use current date for calculation basis
            todayBase.setHours(0,0,0,0);
            const workStartTs = getTimestampForToday(newInputs.workStartTime, todayBase);
            let workEndTs = getTimestampForToday(newInputs.workEndTime, todayBase);
            if (workEndTs <= workStartTs) { // Handle overnight or invalid end times
                 const tomorrow = new Date(todayBase);
                 tomorrow.setDate(todayBase.getDate() + 1);
                 workEndTs = getTimestampForToday(newInputs.workEndTime, tomorrow);
            }
            const scheduledDurationSecs = (workEndTs - workStartTs) / 1000;

            if (scheduledDurationSecs > 0) {
                const earningsRateToday = dailySalary / scheduledDurationSecs;
                setCurrentEarnings(earningsRateToday * currentTotalElapsedTime); // currentTotalElapsedTime is from paused state
            } else {
                setCurrentEarnings(0);
            }
        } else if ( (name === 'monthlySalary' && (parseFloat(value) <= 0 || value === "")) || 
                    (name === 'workDaysPerMonth' && (parseInt(value, 10) <=0 || value === ""))) {
             setCurrentEarnings(0); // If salary or workdays are invalid, earnings are zero
        }
    }
    // No need to call reinitializeTrackerState here as major state changes are handled by start/stop/reset or loadSettings
  };

  const loadSettings = useCallback((newSettings: WageTrackerInputs) => {
    setInputs(newSettings);
    // After settings are loaded (e.g. from import), re-initialize the tracker's state
    // This will update isRunning, earnings, etc., based on the new schedule and current time.
    // It also effectively saves the new settings via the useEffect for localStorage.
    reinitializeTrackerState(newSettings); 
    toast({ title: "配置已加载", description: "新设置已应用。" });
  }, [setInputs, reinitializeTrackerState, toast]);


  // Derived display data calculations
  const numericMonthlySalary = parseFloat(inputs.monthlySalary) || 0;
  const numericWorkDaysPerMonth = parseInt(inputs.workDaysPerMonth, 10) || 1; 
  const dailySalary = numericWorkDaysPerMonth > 0 ? numericMonthlySalary / numericWorkDaysPerMonth : 0;

  const todayBaseForDisplay = new Date(); // Always use current day for display context
  todayBaseForDisplay.setHours(0,0,0,0);
  const workStartTimestampForDisplay = getTimestampForToday(inputs.workStartTime, todayBaseForDisplay);
  let workEndTimestampForDisplay = getTimestampForToday(inputs.workEndTime, todayBaseForDisplay);
  if (workEndTimestampForDisplay <= workStartTimestampForDisplay) { // Correctly handle overnight shifts for display
      const tomorrowBase = new Date(todayBaseForDisplay);
      tomorrowBase.setDate(todayBaseForDisplay.getDate() + 1);
      workEndTimestampForDisplay = getTimestampForToday(inputs.workEndTime, tomorrowBase);
  }
  const workDurationInSecondsForDay = (workEndTimestampForDisplay - workStartTimestampForDisplay) / 1000;
  
  const earningsPerSecond = workDurationInSecondsForDay > 0 ? dailySalary / workDurationInSecondsForDay : 0;
  const totalExpectedEarnings = workDurationInSecondsForDay > 0 ? dailySalary : 0; 

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
    loadSettings, // Expose loadSettings
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
