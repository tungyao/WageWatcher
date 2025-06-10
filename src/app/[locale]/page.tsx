
'use client';

import { useState, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useWageTracker } from '@/hooks/use-wage-tracker';
import type { WageTrackerInputs } from '@/hooks/use-wage-tracker';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { FallingCoins } from '@/components/falling-coins';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { WalletCards, Hourglass, Gift, Clock, TrendingUp, Play, Pause, RotateCcw, Settings, CalendarClock, CalendarDays, Download, Upload, AlertTriangle, Pipette } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useToast as useShadcnToast } from "@/hooks/use-toast"; // Renamed to avoid conflict
import { useTranslations } from 'next-intl';
import {locales} from '@/i18n';

export async function generateStaticParams() {
  return locales.map((locale) => ({locale}));
}

export default function WageWatcherPage() {
  const t = useTranslations('Page');
  const tToasts = useTranslations('Toasts');

  const {
    inputs,
    handleInputChange,
    loadSettings,
    isRunning,
    startTracking,
    stopTracking,
    resetTracking,
    displayData,
    showCelebration,
    setShowCelebration,
  } = useWageTracker({
    // Pass translation functions or keys to the hook if needed for toasts initiated from the hook
    // For now, assuming toasts are handled with keys from the hook and translated here, or hook uses useTranslations directly
  });

  const { toast } = useShadcnToast();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (amount: number, decimalPlaces?: string) => {
    const places = decimalPlaces ? parseInt(decimalPlaces, 10) : 2;
    if (isNaN(places) || places < 0 || places > 20) { 
        return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    }
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: places, maximumFractionDigits: places }).format(amount);
  };

  const handleExportClick = () => {
    try {
      const settingsJson = JSON.stringify(inputs, null, 2);
      const blob = new Blob([settingsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wagewatcher-settings.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: tToasts("exportSuccessTitle"), description: tToasts("exportSuccessMessage") });
    } catch (error) {
      console.error("Export failed:", error);
      toast({ title: tToasts("exportErrorTitle"), description: tToasts("exportErrorMessage"), variant: "destructive" });
    }
  };

  const handleImportButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          throw new Error("File content is not a string.");
        }
        const importedSettings = JSON.parse(text);

        if (
          typeof importedSettings.monthlySalary === 'string' &&
          typeof importedSettings.workDaysPerMonth === 'string' &&
          typeof importedSettings.workStartTime === 'string' &&
          typeof importedSettings.workEndTime === 'string' &&
          typeof importedSettings.celebrationThreshold === 'string' &&
          typeof importedSettings.decimalPlaces === 'string' 
        ) {
          const parsedDecimalPlaces = parseInt(importedSettings.decimalPlaces, 10);
          if (isNaN(parsedDecimalPlaces) || parsedDecimalPlaces < 0 || parsedDecimalPlaces > 20) {
            throw new Error(t("decimalPlacesErrorMessage"));
          }
          loadSettings(importedSettings as WageTrackerInputs);
          setIsSettingsModalOpen(false); 
        } else {
          throw new Error("Invalid file format or missing keys."); // This string could also be translated
        }
      } catch (error) {
        console.error("Import failed:", error);
        toast({ title: tToasts("importErrorTitle"), description: tToasts("importErrorMessage", {error: (error as Error).message}), variant: "destructive" });
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.onerror = () => {
        toast({ title: tToasts("importErrorTitle"), description: tToasts("importReadFileError"), variant: "destructive" });
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
    }
    reader.readAsText(file);
  };


  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4 sm:p-6 md:p-8 relative overflow-hidden font-body">
      <FallingCoins isActive={showCelebration} onAnimationEnd={() => setShowCelebration(false)} />
      
      <header className="w-full max-w-2xl mb-6 text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-primary font-headline tracking-tight">
          {t('title')}
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          {t('subtitle')}
        </p>
      </header>

      <main className="w-full max-w-lg bg-card p-6 sm:p-8 rounded-xl shadow-2xl space-y-6 relative">
        <Dialog open={isSettingsModalOpen} onOpenChange={setIsSettingsModalOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <Settings className="h-5 w-5" />
              <span className="sr-only">{t('settingsButtonSR')}</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('settingsDialogTitle')}</DialogTitle>
              <DialogDescription>
                {t('settingsDialogDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="modalMonthlySalary" className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                  <WalletCards className="w-4 h-4 mr-2 text-primary" /> {t('monthlySalaryLabel')}
                </Label>
                <Input
                  id="modalMonthlySalary"
                  name="monthlySalary"
                  type="number"
                  value={inputs.monthlySalary}
                  onChange={handleInputChange}
                  placeholder={t('monthlySalaryPlaceholder')}
                  className="bg-input"
                />
              </div>
              <div>
                <Label htmlFor="modalWorkDaysPerMonth" className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                  <CalendarDays className="w-4 h-4 mr-2 text-primary" /> {t('workDaysPerMonthLabel')}
                </Label>
                <Input
                  id="modalWorkDaysPerMonth"
                  name="workDaysPerMonth"
                  type="number"
                  value={inputs.workDaysPerMonth}
                  onChange={handleInputChange}
                  placeholder={t('workDaysPerMonthPlaceholder')}
                  className="bg-input"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="modalWorkStartTime" className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                    <CalendarClock className="w-4 h-4 mr-2 text-primary" /> {t('workStartTimeLabel')}
                  </Label>
                  <Input
                    id="modalWorkStartTime"
                    name="workStartTime"
                    type="time"
                    value={inputs.workStartTime}
                    onChange={handleInputChange}
                    className="bg-input"
                  />
                </div>
                <div>
                  <Label htmlFor="modalWorkEndTime" className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                    <CalendarClock className="w-4 h-4 mr-2 text-primary" /> {t('workEndTimeLabel')}
                  </Label>
                  <Input
                    id="modalWorkEndTime"
                    name="workEndTime"
                    type="time"
                    value={inputs.workEndTime}
                    onChange={handleInputChange}
                    className="bg-input"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="modalCelebrationThreshold" className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                  <Gift className="w-4 h-4 mr-2 text-primary" /> {t('celebrationThresholdLabel')}
                </Label>
                <Input
                  id="modalCelebrationThreshold"
                  name="celebrationThreshold"
                  type="number"
                  value={inputs.celebrationThreshold}
                  onChange={handleInputChange}
                  placeholder={t('celebrationThresholdPlaceholder')}
                  className="bg-input"
                />
              </div>
              <div>
                <Label htmlFor="modalDecimalPlaces" className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                  <Pipette className="w-4 h-4 mr-2 text-primary" /> {t('decimalPlacesLabel')}
                </Label>
                <Input
                  id="modalDecimalPlaces"
                  name="decimalPlaces"
                  type="number"
                  min="0"
                  max="20"
                  step="1"
                  value={inputs.decimalPlaces}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (val >= 0 && val <= 20) {
                      handleInputChange(e);
                    } else if (e.target.value === "") { 
                       handleInputChange(e);
                    } else {
                      toast({ title: t('decimalPlacesErrorTitle'), description: t('decimalPlacesErrorMessage'), variant: "destructive"});
                    }
                  }}
                  placeholder={t('decimalPlacesPlaceholder')}
                  className="bg-input"
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleImportButtonClick}>
                  <Upload className="mr-2 h-4 w-4" /> {t('importButton')}
                </Button>
                <Input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileImport} 
                  accept=".json" 
                  className="hidden" 
                />
                <Button type="button" variant="outline" onClick={handleExportClick}>
                  <Download className="mr-2 h-4 w-4" /> {t('exportButton')}
                </Button>
              </div>
              <Button type="button" onClick={() => setIsSettingsModalOpen(false)}>
                {t('doneButton')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        <div className="flex flex-col sm:flex-row gap-3 pt-8">
          <Button onClick={isRunning ? stopTracking : startTracking} className="flex-1" size="lg">
            {isRunning ? <Pause className="mr-2 h-5 w-5" /> : <Play className="mr-2 h-5 w-5" />}
            {isRunning ? t('pauseButton') : t('startButton')}
          </Button>
          <Button onClick={resetTracking} variant="outline" className="flex-1 sm:flex-none" size="lg">
            <RotateCcw className="mr-2 h-5 w-5" /> {t('resetButton')}
          </Button>
        </div>
        
        <Separator />

        <section aria-labelledby="earnings-display" className="text-center">
          <h2 id="earnings-display" className="sr-only">{t('earningsDisplaySR')}</h2>
          <p className="text-sm text-muted-foreground mb-1">{t('totalEarnedTodayLabel')}</p>
          <p className="text-5xl sm:text-6xl font-bold text-primary tracking-tight tabular-numbers">
            {formatCurrency(displayData.currentEarnings, inputs.decimalPlaces)}
          </p>
        </section>

        <section aria-labelledby="metrics-panel">
          <h2 id="metrics-panel" className="sr-only">{t('detailedMetricsSR')}</h2>
          <div className="space-y-3 tabular-numbers">
            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center text-muted-foreground">
                <Clock className="w-5 h-5 mr-2 text-accent" />
                <span>{t('elapsedTimeTodayLabel')}</span>
              </div>
              <span className="font-semibold text-foreground">{displayData.elapsedTimeFormatted}</span>
            </div>

            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center text-muted-foreground">
                <TrendingUp className="w-5 h-5 mr-2 text-accent" />
                <span>{t('earningsPerSecondLabel')}</span>
              </div>
              <span className="font-semibold text-foreground">{formatCurrency(displayData.earningsPerSecond, inputs.decimalPlaces)}</span>
            </div>
          </div>
          
          <div className="mt-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-1">
              <span className="tabular-numbers">{t('progressTodayGoalLabel')}</span>
              <span>{formatCurrency(displayData.totalExpectedEarnings, inputs.decimalPlaces)} {t('goalLabel')}</span>
            </div>
            <Progress value={displayData.progress} aria-label={t('progressAriaLabel', {progress: displayData.progress.toFixed(0)})} className="w-full h-3"/>
          </div>
        </section>
      </main>

      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>{t('footerText', {year: new Date().getFullYear()})}</p>
      </footer>
    </div>
  );
}
