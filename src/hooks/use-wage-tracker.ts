
'use client';

import { useState, useEffect, useCallback } from 'react';
import { shouldAnimate } from '@/ai/flows/animation-orchestrator';
import type { AnimationOrchestratorInput } from '@/ai/flows/animation-orchestrator';
import { useToast } from '@/hooks/use-toast';

const LOCAL_STORAGE_KEY = 'wageWatcherDataV5'; // Incremented version for new logic

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
  isRunning: boolean; // To store manual override state
  elapsedTimeBeforeCurrentSession: number;
  sessionStartTime?: number; // Timestamp of when current manual session started or when scheduled session started
  lastAnimationEarningsCheck: number;
  lastAnimationTimestamp: number;
};

// Helper to get a timestamp for a specific time string on a given base date
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
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null); // When the current *tracking* session began

  const [currentTotalElapsedTime, setCurrentTotalElapsedTime] = useState(0); // Total tracked time for the relevant work period
  const [currentEarnings, setCurrentEarnings] = useState(0);

  const [showCelebration, setShowCelebration] = useState(false);
  const [lastAnimationEarningsCheck, setLastAnimationEarningsCheck] = useState(0);
  const [lastAnimationTimestamp, setLastAnimationTimestamp] = useState(0);

  const reinitializeTrackerState = useCallback((currentSettings: WageTrackerInputs) => {
    const now = new Date();
    const nowTs = now.getTime();

    // Determine Session A (potential shift starting today)
    const sessionA_startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sessionA_startTs = getTimestampForTimeOnDate(currentSettings.workStartTime, sessionA_startDate);
    let sessionA_endTs = getTimestampForTimeOnDate(currentSettings.workEndTime, sessionA_startDate);
    if (sessionA_endTs <= sessionA_startTs) {
        const endDateA = new Date(sessionA_startDate);
        endDateA.setDate(sessionA_startDate.getDate() + 1);
        sessionA_endTs = getTimestampForTimeOnDate(currentSettings.workEndTime, endDateA);
    }

    // Determine Session B (potential shift starting yesterday and spilling into today)
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
    let relevantScheduledSessionStartTs = sessionA_startTs; // Default to today's shift for calculations
    let relevantScheduledSessionEndTs = sessionA_endTs;


    if (nowTs >= sessionA_startTs && nowTs < sessionA_endTs) { // Currently in Session A
        newIsRunning = true;
        newSessionStartTime = sessionA_startTs; // Track from scheduled start of this block
        newCurrentTotalElapsedTime = (nowTs - sessionA_startTs) / 1000;
        relevantScheduledSessionStartTs = sessionA_startTs;
        relevantScheduledSessionEndTs = sessionA_endTs;
    } else if (nowTs >= sessionB_startTs && nowTs < sessionB_endTs) { // Currently in Session B
        newIsRunning = true;
        newSessionStartTime = sessionB_startTs; // Track from scheduled start of this block
        newCurrentTotalElapsedTime = (nowTs - sessionB_startTs) / 1000;
        relevantScheduledSessionStartTs = sessionB_startTs;
        relevantScheduledSessionEndTs = sessionB_endTs;
    } else { // Not currently in a scheduled work period
        newIsRunning = false;
        newSessionStartTime = null;
        // Determine if we are after today's shift or before it
        if (nowTs >= sessionA_endTs) { // After today's scheduled shift
            newCurrentTotalElapsedTime = (sessionA_endTs - sessionA_startTs) / 1000;
            relevantScheduledSessionStartTs = sessionA_startTs;
            relevantScheduledSessionEndTs = sessionA_endTs;
        } else { // Before today's shift (and not in yesterday's spillover)
            newCurrentTotalElapsedTime = 0;
            relevantScheduledSessionStartTs = sessionA_startTs; // Used for "total expected"
            relevantScheduledSessionEndTs = sessionA_endTs;
        }
        newElapsedTimeBeforeCurrentSession = newCurrentTotalElapsedTime > 0 ? newCurrentTotalElapsedTime : 0;
    }
    
    setIsRunning(newIsRunning);
    setSessionStartTime(newSessionStartTime); // This is when the *scheduled* block started if auto-started
    setCurrentTotalElapsedTime(newCurrentTotalElapsedTime);
    setElapsedTimeBeforeCurrentSession(newElapsedTimeBeforeCurrentSession);

    // Reset animation checks on any reinitialization
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
          // These are for animation persistence, reinitializeTrackerState will reset them if needed for a fresh calc
          setLastAnimationTimestamp(savedData.lastAnimationTimestamp || 0);
          setLastAnimationEarningsCheck(savedData.lastAnimationEarningsCheck || 0);
          
          // Restore manual tracking state if it was persisted
          // This part is tricky because reinitializeTrackerState will override based on schedule.
          // For now, let reinitialize handle the "auto-start" based on schedule for consistency.
          // Manual overrides via start/stop buttons will then take effect.
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
    if (isRunning && sessionStartTime !== null) { // Ensure sessionStartTime is not null
      const tick = () => {
        const now = Date.now();
        // If sessionStartTime is the start of a scheduled block, elapsedTimeBeforeCurrentSession is 0.
        // If it's a manually resumed session, elapsedTimeBeforeCurrentSession has prior time.
        const currentSessionDuration = (now - sessionStartTime) / 1000; 
        const totalElapsedTime = elapsedTimeBeforeCurrentSession + currentSessionDuration;
        
        setCurrentTotalElapsedTime(totalElapsedTime);

        const numericMonthlySalary = parseFloat(inputs.monthlySalary);
        const numericWorkDaysPerMonth = parseInt(inputs.workDaysPerMonth, 10);

        if (!isNaN(numericMonthlySalary) && numericMonthlySalary > 0 && !isNaN(numericWorkDaysPerMonth) && numericWorkDaysPerMonth > 0) {
          const dailySalary = numericMonthlySalary / numericWorkDaysPerMonth;
          
          // Determine the scheduled work period that sessionStartTime falls into or refers to
          const baseDateForCalc = new Date(sessionStartTime); // Base on when this tracking session's context started
          const workStartTsForCalc = getTimestampForTimeOnDate(inputs.workStartTime, baseDateForCalc);
          let workEndTsForCalc = getTimestampForTimeOnDate(inputs.workEndTime, baseDateForCalc);

          if (workEndTsForCalc <= workStartTsForCalc) { // Shift crosses midnight
             // If sessionStartTime is for today's 9-5, baseDateForCalc is today. start=today 9am, end=today 5pm.
             // If sessionStartTime is for yesterday's 10pm-6am, baseDateForCalc is yesterday 10pm. start=yesterday 10pm, end=today 6am.
             // This logic needs to ensure workEndTsForCalc is correctly after workStartTsForCalc for THAT shift.
            if (sessionStartTime < getTimestampForTimeOnDate(inputs.workEndTime, baseDateForCalc) ) { 
                 // This means workEndTime is early AM, and session started previous day.
                 // Example: work 22:00-06:00. sessionStartTime is 22:00 on Day X. baseDateForCalc is Day X.
                 // workStartTsForCalc = Day X 22:00. workEndTsForCalc = Day X 06:00 (wrong).
                 // It should be Day X+1 06:00.
                 const endDateForCalc = new Date(baseDateForCalc);
                 endDateForCalc.setDate(baseDateForCalc.getDate() + 1);
                 workEndTsForCalc = getTimestampForTimeOnDate(inputs.workEndTime, endDateForCalc);

            } else { // Standard overnight shift starting on baseDateForCalc
                 const endDateForCalc = new Date(baseDateForCalc);
                 endDateForCalc.setDate(baseDateForCalc.getDate() + 1);
                 workEndTsForCalc = getTimestampForTimeOnDate(inputs.workEndTime, endDateForCalc);
            }
          }
          // Fallback if workStartTsForCalc itself was based on a "today" that mismatches sessionStartTime's actual day
          // This happens if reinitialize sets sessionStartTime to e.g. yesterday 10pm, but then this tick runs.
          // We need the schedule parameters for *that specific shift*.
          // The `relevantScheduledSessionStartTs` and `EndTs` from reinitialization are better.
          // Let's use values based on inputs and current interpretation of "today" or "current shift".
          const currentDay = new Date();
          let shiftStart = getTimestampForTimeOnDate(inputs.workStartTime, currentDay);
          let shiftEnd = getTimestampForTimeOnDate(inputs.workEndTime, currentDay);
          if (shiftEnd <= shiftStart) { // Today's shift crosses midnight
            const shiftEndDate = new Date(currentDay);
            shiftEndDate.setDate(currentDay.getDate() + 1);
            shiftEnd = getTimestampForTimeOnDate(inputs.workEndTime, shiftEndDate);
          }
          // Check if current time is actually part of yesterday's shift spilling over
          if (now < shiftStart) {
            const yesterday = new Date(currentDay);
            yesterday.setDate(currentDay.getDate() -1);
            const yesterdayShiftStart = getTimestampForTimeOnDate(inputs.workStartTime, yesterday);
            let yesterdayShiftEnd = getTimestampForTimeOnDate(inputs.workEndTime, yesterday);
            if(yesterdayShiftEnd <= yesterdayShiftStart) {
                 yesterdayShiftEnd = getTimestampForTimeOnDate(inputs.workEndTime, currentDay); // ends today
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
                });
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
  }, [isRunning, sessionStartTime, inputs, elapsedTimeBeforeCurrentSession, lastAnimationTimestamp, lastAnimationEarningsCheck, toast]);

  const startTracking = useCallback(() => {
    const numericMonthlySalary = parseFloat(inputs.monthlySalary);
    const numericWorkDaysPerMonth = parseInt(inputs.workDaysPerMonth, 10);
    
    if (isNaN(numericMonthlySalary) || numericMonthlySalary <= 0 || isNaN(numericWorkDaysPerMonth) || numericWorkDaysPerMonth <= 0) {
      toast({ title: "无效输入", description: "请输入有效的月薪和工作天数。", variant: "destructive"});
      return;
    }
    
    // When manually starting, current elapsedTimeBeforeCurrentSession is preserved.
    // Session starts NOW.
    setSessionStartTime(Date.now()); 
    setIsRunning(true);
    
  }, [inputs, toast]);

  const stopTracking = useCallback(() => {
    if (sessionStartTime && isRunning) {
      const currentSessionDuration = (Date.now() - sessionStartTime) / 1000;
      const newTotalElapsed = elapsedTimeBeforeCurrentSession + currentSessionDuration;
      setElapsedTimeBeforeCurrentSession(newTotalElapsed); 
      setCurrentTotalElapsedTime(newTotalElapsed); // Update display immediately
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
    reinitializeTrackerState(defaultSettings);

  }, [toast, reinitializeTrackerState]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const newInputs = { ...inputs, [name]: value };
    setInputs(newInputs);

    if (['monthlySalary', 'workDaysPerMonth', 'workStartTime', 'workEndTime'].includes(name)) {
        reinitializeTrackerState(newInputs);
    } else if (name === 'celebrationThreshold' && !isRunning) {
        // Only recalculate earnings if not running for threshold changes if needed,
        // but reinitialize already handles earnings. Animation logic will pick up new threshold.
    }
  };

  const loadSettings = useCallback((newSettings: WageTrackerInputs) => {
    setInputs(newSettings);
    reinitializeTrackerState(newSettings); 
    toast({ title: "配置已加载", description: "新设置已应用。" });
  }, [setInputs, reinitializeTrackerState, toast]);


  const numericMonthlySalary = parseFloat(inputs.monthlySalary) || 0;
  const numericWorkDaysPerMonth = parseInt(inputs.workDaysPerMonth, 10) || 1; 
  const dailySalary = numericWorkDaysPerMonth > 0 ? numericMonthlySalary / numericWorkDaysPerMonth : 0;

  // For display purposes, calculate "today's" total expected earnings and scheduled duration
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

