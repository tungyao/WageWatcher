
'use client';

import { useState, useEffect, useCallback } from 'react';
import { shouldAnimate } from '@/ai/flows/animation-orchestrator';
import type { AnimationOrchestratorInput } from '@/ai/flows/animation-orchestrator';
import { useToast } from '@/hooks/use-toast';

const LOCAL_STORAGE_KEY = 'wageWatcherDataV4'; // V4 for monthly salary logic

const DEFAULT_MONTHLY_SALARY = 5000;
const DEFAULT_WORK_DAYS_PER_MONTH = 22;
const DEFAULT_WORK_START_TIME = "09:00";
const DEFAULT_WORK_END_TIME = "17:00";
const DEFAULT_CELEBRATION_THRESHOLD = 100;

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
        return new Date(baseDate).setHours(0,0,0,0); 
    }
    const date = new Date(baseDate);
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
};


export function useWageTracker() {
  const { toast } = useToast();

  const [inputs, setInputs] = useState({
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
          // savedElapsedTimeBeforeSession = savedData.elapsedTimeBeforeCurrentSession || 0; // Not used for schedule-based init
        } catch (error) {
          console.error("Failed to parse saved data from localStorage", error);
          localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
      }
      setInputs(initialSettings);

      const now = new Date();
      const todayBaseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const todayWorkStartTimestamp = getTimestampForToday(initialSettings.workStartTime, todayBaseDate);
      let todayWorkEndTimestamp = getTimestampForToday(initialSettings.workEndTime, todayBaseDate);

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
        newSessionStartTime = todayWorkStartTimestamp; 
        newCurrentTotalElapsedTime = (currentTimestamp - todayWorkStartTimestamp) / 1000;
      } else if (currentTimestamp >= todayWorkEndTimestamp) { 
        newIsRunning = false;
        const scheduledDurationToday = (todayWorkEndTimestamp - todayWorkStartTimestamp) / 1000;
        newCurrentTotalElapsedTime = scheduledDurationToday > 0 ? scheduledDurationToday : 0;
        newElapsedTimeBeforeCurrentSession = newCurrentTotalElapsedTime;
      } else { 
        newIsRunning = false;
      }

      setIsRunning(newIsRunning);
      setSessionStartTime(newSessionStartTime);
      setCurrentTotalElapsedTime(newCurrentTotalElapsedTime);
      setElapsedTimeBeforeCurrentSession(newElapsedTimeBeforeCurrentSession); 

      const monthlySalaryNum = parseFloat(initialSettings.monthlySalary);
      const workDaysNum = parseInt(initialSettings.workDaysPerMonth, 10);

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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


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
        const currentSessionDuration = (now - sessionStartTime) / 1000;
        const totalElapsedTime = elapsedTimeBeforeCurrentSession + currentSessionDuration;
        
        setCurrentTotalElapsedTime(totalElapsedTime);

        const numericMonthlySalary = parseFloat(inputs.monthlySalary);
        const numericWorkDaysPerMonth = parseInt(inputs.workDaysPerMonth, 10);

        if (!isNaN(numericMonthlySalary) && numericMonthlySalary > 0 && !isNaN(numericWorkDaysPerMonth) && numericWorkDaysPerMonth > 0) {
          const dailySalary = numericMonthlySalary / numericWorkDaysPerMonth;
          
          const effectiveBaseDate = new Date(sessionStartTime); // Use session start time's date for schedule
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
                  toast({ title: "Animation Check Error", description: "Could not determine animation status.", variant: "destructive" });
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
      toast({ title: "Invalid Input", description: "Please enter valid positive values for monthly salary and work days.", variant: "destructive"});
      return;
    }
    setSessionStartTime(Date.now());
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
    setInputs({
        monthlySalary: DEFAULT_MONTHLY_SALARY.toString(),
        workDaysPerMonth: DEFAULT_WORK_DAYS_PER_MONTH.toString(),
        workStartTime: DEFAULT_WORK_START_TIME,
        workEndTime: DEFAULT_WORK_END_TIME,
        celebrationThreshold: DEFAULT_CELEBRATION_THRESHOLD.toString(),
    });
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    toast({ title: "Tracker Reset", description: "All data has been cleared." });
    
    const now = new Date();
    const todayBaseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayWorkStartTimestamp = getTimestampForToday(DEFAULT_WORK_START_TIME, todayBaseDate);
    if (now.getTime() < todayWorkStartTimestamp) {
        setIsRunning(false);
        setCurrentTotalElapsedTime(0);
        setCurrentEarnings(0);
        setElapsedTimeBeforeCurrentSession(0);
    } 

  }, [toast]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let newInputs = { ...inputs, [name]: value };
    setInputs(newInputs);

    if (!isRunning) {
        const monthlySalaryNum = name === 'monthlySalary' ? parseFloat(value) : parseFloat(newInputs.monthlySalary);
        const workDaysNum = name === 'workDaysPerMonth' ? parseInt(value, 10) : parseInt(newInputs.workDaysPerMonth, 10);

        if (!isNaN(monthlySalaryNum) && monthlySalaryNum > 0 && !isNaN(workDaysNum) && workDaysNum > 0) {
            const dailySalary = monthlySalaryNum / workDaysNum;
            
            const todayBase = new Date();
            todayBase.setHours(0,0,0,0);
            const workStartTs = getTimestampForToday(newInputs.workStartTime, todayBase);
            let workEndTs = getTimestampForToday(newInputs.workEndTime, todayBase);
            if (workEndTs <= workStartTs) {
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
        } else if ( (name === 'monthlySalary' && (parseFloat(value) <= 0 || value === "")) || (name === 'workDaysPerMonth' && (parseInt(value, 10) <=0 || value === ""))) {
             setCurrentEarnings(0);
        }
    }
  };

  const numericMonthlySalary = parseFloat(inputs.monthlySalary) || 0;
  const numericWorkDaysPerMonth = parseInt(inputs.workDaysPerMonth, 10) || 1; // Avoid division by zero
  const dailySalary = numericWorkDaysPerMonth > 0 ? numericMonthlySalary / numericWorkDaysPerMonth : 0;

  const todayBaseForDisplay = new Date();
  todayBaseForDisplay.setHours(0,0,0,0);
  const workStartTimestampForDisplay = getTimestampForToday(inputs.workStartTime, todayBaseForDisplay);
  let workEndTimestampForDisplay = getTimestampForToday(inputs.workEndTime, todayBaseForDisplay);
  if (workEndTimestampForDisplay <= workStartTimestampForDisplay) {
      const tomorrowBase = new Date(todayBaseForDisplay);
      tomorrowBase.setDate(todayBaseForDisplay.getDate() + 1);
      workEndTimestampForDisplay = getTimestampForToday(inputs.workEndTime, tomorrowBase);
  }
  const workDurationInSecondsForDay = (workEndTimestampForDisplay - workStartTimestampForDisplay) / 1000;
  
  const earningsPerSecond = workDurationInSecondsForDay > 0 ? dailySalary / workDurationInSecondsForDay : 0;
  const totalExpectedEarnings = workDurationInSecondsForDay > 0 ? dailySalary : 0; // Expected earnings for one full scheduled day

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
