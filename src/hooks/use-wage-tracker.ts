
'use client';

import { useState, useEffect, useCallback } from 'react';
// AI feature disabled for static export
// import { shouldAnimate } from '@/ai/flows/animation-orchestrator'; 
// import type { AnimationOrchestratorInput } from '@/ai/flows/animation-orchestrator'; 
import { useToast as useShadcnToast } from "@/hooks/use-toast"; // Renamed
import { useTranslations } from 'next-intl';


const LOCAL_STORAGE_KEY = 'wageWatcherDataV7'; // Incremented version for new structure

const DEFAULT_MONTHLY_SALARY = 5000;
const DEFAULT_WORK_DAYS_PER_MONTH = 22;
const DEFAULT_WORK_START_TIME = "09:00";
const DEFAULT_WORK_END_TIME = "17:00";
const DEFAULT_CELEBRATION_THRESHOLD = 100;
const DEFAULT_DECIMAL_PLACES = 2;

export type WageTrackerInputs = {
  monthlySalary: string;
  workDaysPerMonth: string;
  workStartTime: string;
  workEndTime: string;
  celebrationThreshold: string;
  decimalPlaces: string;
};

type WageWatcherPersistentData = {
  monthlySalary: number;
  workDaysPerMonth: number;
  workStartTime: string;
  workEndTime: string;
  celebrationThreshold: number;
  decimalPlaces: number;
  isRunning: boolean; 
  elapsedTimeBeforeCurrentSession: number;
  sessionStartTime?: number; 
  lastAnimationEarningsCheck: number;
  lastAnimationTimestamp: number;
};

const getTimestampForTimeOnDate = (timeStr: string, baseDate: Date): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
        const errorDate = new Date(baseDate);
        errorDate.setHours(0,0,0,0);
        return errorDate.getTime();
    }
    const date = new Date(baseDate);
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
};


export function useWageTracker() {
  const t = useTranslations('Toasts'); // For toast messages
  const { toast } = useShadcnToast();

  const [inputs, setInputs] = useState<WageTrackerInputs>({
    monthlySalary: DEFAULT_MONTHLY_SALARY.toString(),
    workDaysPerMonth: DEFAULT_WORK_DAYS_PER_MONTH.toString(),
    workStartTime: DEFAULT_WORK_START_TIME,
    workEndTime: DEFAULT_WORK_END_TIME,
    celebrationThreshold: DEFAULT_CELEBRATION_THRESHOLD.toString(),
    decimalPlaces: DEFAULT_DECIMAL_PLACES.toString(),
  });

  const [isRunning, setIsRunning] = useState(false);
  const [elapsedTimeBeforeCurrentSession, setElapsedTimeBeforeCurrentSession] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null); 

  const [currentTotalElapsedTime, setCurrentTotalElapsedTime] = useState(0); 
  const [currentEarnings, setCurrentEarnings] = useState(0);

  const [showCelebration, setShowCelebration] = useState(false);
  const [lastAnimationEarningsCheck, setLastAnimationEarningsCheck] = useState(0);
  const [lastAnimationTimestamp, setLastAnimationTimestamp] = useState(0);

  const reinitializeTrackerState = useCallback((currentSettings: WageTrackerInputs) => {
    const now = new Date();
    const nowTs = now.getTime();

    const sessionA_startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sessionA_startTs = getTimestampForTimeOnDate(currentSettings.workStartTime, sessionA_startDate);
    let sessionA_endTs = getTimestampForTimeOnDate(currentSettings.workEndTime, sessionA_startDate);
    if (sessionA_endTs <= sessionA_startTs) {
        const endDateA = new Date(sessionA_startDate);
        endDateA.setDate(sessionA_startDate.getDate() + 1);
        sessionA_endTs = getTimestampForTimeOnDate(currentSettings.workEndTime, endDateA);
    }

    const sessionB_startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    sessionB_startDate.setDate(sessionB_startDate.getDate() - 1);
    const sessionB_startTs = getTimestampForTimeOnDate(currentSettings.workStartTime, sessionB_startDate);
    let sessionB_endTs = getTimestampForTimeOnDate(currentSettings.workEndTime, sessionB_startDate);
    if (sessionB_endTs <= sessionB_startTs) {
        const endDateB = new Date(sessionB_startDate);
        endDateB.setDate(sessionB_startDate.getDate() + 1);
        sessionB_endTs = getTimestampForTimeOnDate(currentSettings.workEndTime, endDateB);
    }

    let newIsRunning = false;
    let newSessionStartTime: number | null = null;
    let newCurrentTotalElapsedTime = 0;
    let newElapsedTimeBeforeCurrentSession = 0;
    let relevantScheduledSessionStartTs = sessionA_startTs; 
    let relevantScheduledSessionEndTs = sessionA_endTs;


    if (nowTs >= sessionA_startTs && nowTs < sessionA_endTs) { 
        newIsRunning = true;
        newSessionStartTime = sessionA_startTs; 
        newCurrentTotalElapsedTime = (nowTs - sessionA_startTs) / 1000;
        relevantScheduledSessionStartTs = sessionA_startTs;
        relevantScheduledSessionEndTs = sessionA_endTs;
    } else if (nowTs >= sessionB_startTs && nowTs < sessionB_endTs) { 
        newIsRunning = true;
        newSessionStartTime = sessionB_startTs; 
        newCurrentTotalElapsedTime = (nowTs - sessionB_startTs) / 1000;
        relevantScheduledSessionStartTs = sessionB_startTs;
        relevantScheduledSessionEndTs = sessionB_endTs;
    } else { 
        newIsRunning = false;
        newSessionStartTime = null;
        
        if (nowTs >= sessionA_endTs) { 
            newCurrentTotalElapsedTime = (sessionA_endTs - sessionA_startTs) / 1000;
            relevantScheduledSessionStartTs = sessionA_startTs;
            relevantScheduledSessionEndTs = sessionA_endTs;
        } else { 
            newCurrentTotalElapsedTime = 0;
            relevantScheduledSessionStartTs = sessionA_startTs; 
            relevantScheduledSessionEndTs = sessionA_endTs;
        }
        newElapsedTimeBeforeCurrentSession = newCurrentTotalElapsedTime > 0 ? newCurrentTotalElapsedTime : 0;
    }
    
    setIsRunning(newIsRunning);
    setSessionStartTime(newSessionStartTime); 
    setCurrentTotalElapsedTime(newCurrentTotalElapsedTime);
    setElapsedTimeBeforeCurrentSession(newElapsedTimeBeforeCurrentSession);

    
    setLastAnimationEarningsCheck(0);
    setLastAnimationTimestamp(0);

    const monthlySalaryNum = parseFloat(currentSettings.monthlySalary);
    const workDaysNum = parseInt(currentSettings.workDaysPerMonth, 10);

    if (!isNaN(monthlySalaryNum) && monthlySalaryNum > 0 && !isNaN(workDaysNum) && workDaysNum > 0) {
        const dailySalary = monthlySalaryNum / workDaysNum;
        const scheduledDurationSec = (relevantScheduledSessionEndTs - relevantScheduledSessionStartTs) / 1000;
        if (scheduledDurationSec > 0) {
            const earningsRate = dailySalary / scheduledDurationSec;
            setCurrentEarnings(earningsRate * newCurrentTotalElapsedTime);
        } else {
            setCurrentEarnings(0);
        }
    } else {
        setCurrentEarnings(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIsRunning, setSessionStartTime, setCurrentTotalElapsedTime, setElapsedTimeBeforeCurrentSession, setCurrentEarnings, setLastAnimationEarningsCheck, setLastAnimationTimestamp]);


  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDataRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      let initialSettings = {
        monthlySalary: DEFAULT_MONTHLY_SALARY.toString(),
        workDaysPerMonth: DEFAULT_WORK_DAYS_PER_MONTH.toString(),
        workStartTime: DEFAULT_WORK_START_TIME,
        workEndTime: DEFAULT_WORK_END_TIME,
        celebrationThreshold: DEFAULT_CELEBRATION_THRESHOLD.toString(),
        decimalPlaces: DEFAULT_DECIMAL_PLACES.toString(),
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
            decimalPlaces: (savedData.decimalPlaces ?? DEFAULT_DECIMAL_PLACES).toString(), // Use ?? for new fields
          };
          
          setLastAnimationTimestamp(savedData.lastAnimationTimestamp || 0);
          setLastAnimationEarningsCheck(savedData.lastAnimationEarningsCheck || 0);
          
        } catch (error) {
          console.error("Failed to parse saved data from localStorage", error);
          localStorage.removeItem(LOCAL_STORAGE_KEY); 
        }
      }
      setInputs(initialSettings);
      reinitializeTrackerState(initialSettings); 
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
        decimalPlaces: parseInt(inputs.decimalPlaces, 10) ?? DEFAULT_DECIMAL_PLACES,
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
    if (isRunning && sessionStartTime !== null) { 
      const tick = () => {
        const now = Date.now();
        
        const currentSessionDuration = (now - sessionStartTime) / 1000; 
        const totalElapsedTime = elapsedTimeBeforeCurrentSession + currentSessionDuration;
        
        setCurrentTotalElapsedTime(totalElapsedTime);

        const numericMonthlySalary = parseFloat(inputs.monthlySalary);
        const numericWorkDaysPerMonth = parseInt(inputs.workDaysPerMonth, 10);

        if (!isNaN(numericMonthlySalary) && numericMonthlySalary > 0 && !isNaN(numericWorkDaysPerMonth) && numericWorkDaysPerMonth > 0) {
          const dailySalary = numericMonthlySalary / numericWorkDaysPerMonth;
          
          const currentDay = new Date();
          let shiftStart = getTimestampForTimeOnDate(inputs.workStartTime, currentDay);
          let shiftEnd = getTimestampForTimeOnDate(inputs.workEndTime, currentDay);
          if (shiftEnd <= shiftStart) { 
            const shiftEndDate = new Date(currentDay);
            shiftEndDate.setDate(currentDay.getDate() + 1);
            shiftEnd = getTimestampForTimeOnDate(inputs.workEndTime, shiftEndDate);
          }
          
          if (now < shiftStart) {
            const yesterday = new Date(currentDay);
            yesterday.setDate(currentDay.getDate() -1);
            const yesterdayShiftStart = getTimestampForTimeOnDate(inputs.workStartTime, yesterday);
            let yesterdayShiftEnd = getTimestampForTimeOnDate(inputs.workEndTime, yesterday);
            if(yesterdayShiftEnd <= yesterdayShiftStart) {
                 yesterdayShiftEnd = getTimestampForTimeOnDate(inputs.workEndTime, currentDay); 
            }
            if (now >= yesterdayShiftStart && now < yesterdayShiftEnd) {
                shiftStart = yesterdayShiftStart;
                shiftEnd = yesterdayShiftEnd;
            }
          }


          const scheduledDurationSecsForShift = (shiftEnd - shiftStart) / 1000;

          if (scheduledDurationSecsForShift > 0) {
            const earningsRateForShift = dailySalary / scheduledDurationSecsForShift;
            const newEarnings = earningsRateForShift * totalElapsedTime;
            setCurrentEarnings(newEarnings);

            const numericThreshold = parseFloat(inputs.celebrationThreshold);
            if (!isNaN(numericThreshold) && numericThreshold > 0) {
              const prevMilestone = Math.floor(lastAnimationEarningsCheck / numericThreshold);
              const currentMilestone = Math.floor(newEarnings / numericThreshold);

              if (currentMilestone > prevMilestone && newEarnings > lastAnimationEarningsCheck) {
                const MIN_ANIMATION_INTERVAL = 60000; 
                if (Date.now() - lastAnimationTimestamp > MIN_ANIMATION_INTERVAL) {
                    setShowCelebration(true);
                    setLastAnimationTimestamp(Date.now());
                }
                setLastAnimationEarningsCheck(newEarnings);
              }
            }
          } else {
             setCurrentEarnings(0); 
          }
        }
        animationFrameId = requestAnimationFrame(tick);
      };
      animationFrameId = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(animationFrameId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, sessionStartTime, inputs, elapsedTimeBeforeCurrentSession, lastAnimationTimestamp, lastAnimationEarningsCheck]);

  const startTracking = useCallback(() => {
    const numericMonthlySalary = parseFloat(inputs.monthlySalary);
    const numericWorkDaysPerMonth = parseInt(inputs.workDaysPerMonth, 10);
    
    if (isNaN(numericMonthlySalary) || numericMonthlySalary <= 0 || isNaN(numericWorkDaysPerMonth) || numericWorkDaysPerMonth <= 0) {
      toast({ title: t("invalidInputTitle"), description: t("invalidInputMessage"), variant: "destructive"});
      return;
    }
    
    setSessionStartTime(Date.now()); 
    setIsRunning(true);
    
  }, [inputs, toast, t]);

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
        decimalPlaces: DEFAULT_DECIMAL_PLACES.toString(),
    };
    setInputs(defaultSettings);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    toast({ title: t("resetSuccessTitle"), description: t("resetSuccessMessage") });
    reinitializeTrackerState(defaultSettings);

  }, [toast, t, reinitializeTrackerState]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const newInputs = { ...inputs, [name]: value };
    setInputs(newInputs);

    if (['monthlySalary', 'workDaysPerMonth', 'workStartTime', 'workEndTime', 'celebrationThreshold', 'decimalPlaces'].includes(name)) {
        reinitializeTrackerState(newInputs);
    }
  };

  const loadSettings = useCallback((newSettings: WageTrackerInputs) => {
    setInputs(newSettings);
    reinitializeTrackerState(newSettings); 
    toast({ title: t("loadSuccessTitle"), description: t("loadSuccessMessage") });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setInputs, reinitializeTrackerState, toast, t]);


  const numericMonthlySalary = parseFloat(inputs.monthlySalary) || 0;
  const numericWorkDaysPerMonth = parseInt(inputs.workDaysPerMonth, 10) || 1; 
  const dailySalary = numericWorkDaysPerMonth > 0 ? numericMonthlySalary / numericWorkDaysPerMonth : 0;

  
  const displayBaseDate = new Date();
  const displayWorkStartTs = getTimestampForTimeOnDate(inputs.workStartTime, displayBaseDate);
  let displayWorkEndTs = getTimestampForTimeOnDate(inputs.workEndTime, displayBaseDate);
  if (displayWorkEndTs <= displayWorkStartTs) { 
      const displayEndDate = new Date(displayBaseDate);
      displayEndDate.setDate(displayBaseDate.getDate() + 1);
      displayWorkEndTs = getTimestampForTimeOnDate(inputs.workEndTime, displayEndDate);
  }
  const displayWorkDurationSecs = (displayWorkEndTs - displayWorkStartTs) / 1000;
  
  const earningsPerSecond = displayWorkDurationSecs > 0 ? dailySalary / displayWorkDurationSecs : 0;
  const totalExpectedEarnings = displayWorkDurationSecs > 0 ? dailySalary : 0; 

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
    loadSettings, 
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
