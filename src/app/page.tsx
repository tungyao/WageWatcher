
'use client';

import { useState } from 'react';
import { useWageTracker } from '@/hooks/use-wage-tracker';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { FallingCoins } from '@/components/falling-coins';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { WalletCards, Hourglass, Gift, Clock, TrendingUp, Play, Pause, RotateCcw, Settings } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export default function WageWatcherPage() {
  const {
    inputs,
    handleInputChange,
    isRunning,
    startTracking,
    stopTracking,
    resetTracking,
    displayData,
    showCelebration,
    setShowCelebration,
  } = useWageTracker();

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4 sm:p-6 md:p-8 relative overflow-hidden font-body">
      <FallingCoins isActive={showCelebration} onAnimationEnd={() => setShowCelebration(false)} />
      
      <header className="w-full max-w-2xl mb-6 text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-primary font-headline tracking-tight">
          WageWatcher
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          Track your earnings in real-time & celebrate your milestones!
        </p>
      </header>

      <main className="w-full max-w-lg bg-card p-6 sm:p-8 rounded-xl shadow-2xl space-y-6 relative">
        <Dialog open={isSettingsModalOpen} onOpenChange={setIsSettingsModalOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <Settings className="h-5 w-5" />
              <span className="sr-only">Open Settings</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>
                Configure your tracking parameters. Changes are saved automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="modalHourlyWage" className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                    <WalletCards className="w-4 h-4 mr-2 text-primary" /> Hourly Wage
                  </Label>
                  <Input
                    id="modalHourlyWage"
                    name="hourlyWage"
                    type="number"
                    value={inputs.hourlyWage}
                    onChange={handleInputChange}
                    placeholder="e.g., 25"
                    className="bg-input"
                    disabled={isRunning}
                  />
                </div>
                <div>
                  <Label htmlFor="modalWorkDurationHours" className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                    <Hourglass className="w-4 h-4 mr-2 text-primary" /> Work Duration (Hours)
                  </Label>
                  <Input
                    id="modalWorkDurationHours"
                    name="workDurationHours"
                    type="number"
                    value={inputs.workDurationHours}
                    onChange={handleInputChange}
                    placeholder="e.g., 8"
                    className="bg-input"
                    disabled={isRunning}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="modalCelebrationThreshold" className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                  <Gift className="w-4 h-4 mr-2 text-primary" /> Celebration Threshold
                </Label>
                <Input
                  id="modalCelebrationThreshold"
                  name="celebrationThreshold"
                  type="number"
                  value={inputs.celebrationThreshold}
                  onChange={handleInputChange}
                  placeholder="e.g., 100"
                  className="bg-input"
                  disabled={isRunning}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setIsSettingsModalOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        <div className="flex flex-col sm:flex-row gap-3 pt-8"> {/* Added pt-8 to give space for settings icon if card is small */}
          <Button onClick={isRunning ? stopTracking : startTracking} className="flex-1" size="lg">
            {isRunning ? <Pause className="mr-2 h-5 w-5" /> : <Play className="mr-2 h-5 w-5" />}
            {isRunning ? 'Pause' : 'Start Tracking'}
          </Button>
          <Button onClick={resetTracking} variant="outline" className="flex-1 sm:flex-none" size="lg">
            <RotateCcw className="mr-2 h-5 w-5" /> Reset
          </Button>
        </div>
        
        <Separator />

        <section aria-labelledby="earnings-display" className="text-center">
          <h2 id="earnings-display" className="sr-only">Earnings Display</h2>
          <p className="text-sm text-muted-foreground mb-1">Total Earned</p>
          <p className="text-5xl sm:text-6xl font-bold text-primary tracking-tight">
            {formatCurrency(displayData.currentEarnings)}
          </p>
        </section>

        <section aria-labelledby="metrics-panel">
          <h2 id="metrics-panel" className="sr-only">Detailed Metrics</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center text-muted-foreground">
                <Clock className="w-5 h-5 mr-2 text-accent" />
                <span>Elapsed Time</span>
              </div>
              <span className="font-semibold text-foreground">{displayData.elapsedTimeFormatted}</span>
            </div>

            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center text-muted-foreground">
                <TrendingUp className="w-5 h-5 mr-2 text-accent" />
                <span>Earnings/Sec</span>
              </div>
              <span className="font-semibold text-foreground">{formatCurrency(displayData.earningsPerSecond)}</span>
            </div>
          </div>
          
          <div className="mt-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-1">
              <span>Progress</span>
              <span>{formatCurrency(displayData.totalExpectedEarnings)} Goal</span>
            </div>
            <Progress value={displayData.progress} aria-label={`Earnings progress: ${displayData.progress.toFixed(0)}%`} className="w-full h-3"/>
          </div>
        </section>
      </main>

      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} WageWatcher. Keep earning!</p>
      </footer>
    </div>
  );
}

