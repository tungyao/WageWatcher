
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
import { WalletCards, Hourglass, Gift, Clock, TrendingUp, Play, Pause, RotateCcw, Settings, CalendarClock, CalendarDays, Download, Upload } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useToast } from "@/hooks/use-toast";


export default function WageWatcherPage() {
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
  } = useWageTracker();

  const { toast } = useToast();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount);
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
      toast({ title: "配置已导出", description: "您的设置已保存到 wagewatcher-settings.json。" });
    } catch (error) {
      console.error("Export failed:", error);
      toast({ title: "导出错误", description: "无法导出配置。", variant: "destructive" });
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

        // Validate imported settings structure
        if (
          typeof importedSettings.monthlySalary === 'string' &&
          typeof importedSettings.workDaysPerMonth === 'string' &&
          typeof importedSettings.workStartTime === 'string' &&
          typeof importedSettings.workEndTime === 'string' &&
          typeof importedSettings.celebrationThreshold === 'string'
        ) {
          loadSettings(importedSettings as WageTrackerInputs);
          // Toast is handled by loadSettings now
          setIsSettingsModalOpen(false); // Close modal on successful import
        } else {
          throw new Error("Invalid file format or missing keys.");
        }
      } catch (error) {
        console.error("Import failed:", error);
        toast({ title: "导入错误", description: `无法导入配置: ${(error as Error).message}`, variant: "destructive" });
      } finally {
        // Reset file input to allow importing the same file again if needed
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.onerror = () => {
        toast({ title: "导入错误", description: "读取文件失败。", variant: "destructive" });
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
          WageWatcher
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          实时追踪您的收入 &庆祝您的里程碑！
        </p>
      </header>

      <main className="w-full max-w-lg bg-card p-6 sm:p-8 rounded-xl shadow-2xl space-y-6 relative">
        <Dialog open={isSettingsModalOpen} onOpenChange={setIsSettingsModalOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <Settings className="h-5 w-5" />
              <span className="sr-only">打开设置</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>设置</DialogTitle>
              <DialogDescription>
                配置您的追踪参数。更改将自动保存。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="modalMonthlySalary" className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                  <WalletCards className="w-4 h-4 mr-2 text-primary" /> 月薪
                </Label>
                <Input
                  id="modalMonthlySalary"
                  name="monthlySalary"
                  type="number"
                  value={inputs.monthlySalary}
                  onChange={handleInputChange}
                  placeholder="例如, 5000"
                  className="bg-input"
                />
              </div>
              <div>
                <Label htmlFor="modalWorkDaysPerMonth" className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                  <CalendarDays className="w-4 h-4 mr-2 text-primary" /> 每月工作天数
                </Label>
                <Input
                  id="modalWorkDaysPerMonth"
                  name="workDaysPerMonth"
                  type="number"
                  value={inputs.workDaysPerMonth}
                  onChange={handleInputChange}
                  placeholder="例如, 22"
                  className="bg-input"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="modalWorkStartTime" className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                    <CalendarClock className="w-4 h-4 mr-2 text-primary" /> 工作开始时间
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
                    <CalendarClock className="w-4 h-4 mr-2 text-primary" /> 工作结束时间
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
                  <Gift className="w-4 h-4 mr-2 text-primary" /> 庆祝阈值 (元)
                </Label>
                <Input
                  id="modalCelebrationThreshold"
                  name="celebrationThreshold"
                  type="number"
                  value={inputs.celebrationThreshold}
                  onChange={handleInputChange}
                  placeholder="例如, 100"
                  className="bg-input"
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleImportButtonClick}>
                  <Upload className="mr-2 h-4 w-4" /> 导入配置
                </Button>
                <Input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileImport} 
                  accept=".json" 
                  className="hidden" 
                />
                <Button type="button" variant="outline" onClick={handleExportClick}>
                  <Download className="mr-2 h-4 w-4" /> 导出配置
                </Button>
              </div>
              <Button type="button" onClick={() => setIsSettingsModalOpen(false)}>
                完成
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        <div className="flex flex-col sm:flex-row gap-3 pt-8">
          <Button onClick={isRunning ? stopTracking : startTracking} className="flex-1" size="lg">
            {isRunning ? <Pause className="mr-2 h-5 w-5" /> : <Play className="mr-2 h-5 w-5" />}
            {isRunning ? '暂停' : '开始追踪'}
          </Button>
          <Button onClick={resetTracking} variant="outline" className="flex-1 sm:flex-none" size="lg">
            <RotateCcw className="mr-2 h-5 w-5" /> 重置
          </Button>
        </div>
        
        <Separator />

        <section aria-labelledby="earnings-display" className="text-center">
          <h2 id="earnings-display" className="sr-only">收入显示</h2>
          <p className="text-sm text-muted-foreground mb-1">今日总收入</p>
          <p className="text-5xl sm:text-6xl font-bold text-primary tracking-tight">
            {formatCurrency(displayData.currentEarnings)}
          </p>
        </section>

        <section aria-labelledby="metrics-panel">
          <h2 id="metrics-panel" className="sr-only">详细指标</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center text-muted-foreground">
                <Clock className="w-5 h-5 mr-2 text-accent" />
                <span>已过时间 (今日)</span>
              </div>
              <span className="font-semibold text-foreground">{displayData.elapsedTimeFormatted}</span>
            </div>

            <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center text-muted-foreground">
                <TrendingUp className="w-5 h-5 mr-2 text-accent" />
                <span>每秒收入</span>
              </div>
              <span className="font-semibold text-foreground">{formatCurrency(displayData.earningsPerSecond)}</span>
            </div>
          </div>
          
          <div className="mt-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-1">
              <span>进度 (今日目标)</span>
              <span>{formatCurrency(displayData.totalExpectedEarnings)} 目标</span>
            </div>
            <Progress value={displayData.progress} aria-label={`今日收入进度: ${displayData.progress.toFixed(0)}%`} className="w-full h-3"/>
          </div>
        </section>
      </main>

      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} WageWatcher. 努力赚钱!</p>
      </footer>
    </div>
  );
}
