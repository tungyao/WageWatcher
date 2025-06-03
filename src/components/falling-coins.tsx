
'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins } from 'lucide-react'; // Using Coins icon as a particle

interface FallingCoinsProps {
  isActive: boolean;
  onAnimationEnd: () => void;
  count?: number;
}

const Coin = ({ onComplete, id }: { onComplete: (id: number) => void; id: number }) => {
  const duration = Math.random() * 2 + 3; // 3-5 seconds
  const initialXPercent = Math.random() * 80 + 10; // 10% to 90% of vw
  const sway = (Math.random() - 0.5) * 40; // sway -20% to +20% of vw
  const rotation = Math.random() * 720 - 360; // -360 to 360 deg rotation
  const delay = Math.random() * 0.8; 

  return (
    <motion.div
      key={id}
      initial={{ y: '-10vh', x: `${initialXPercent}vw`, opacity: 1, rotate: 0 }}
      animate={{ y: '110vh', x: `${initialXPercent + sway}vw`, rotate: rotation }}
      exit={{ opacity: 0, y: '120vh' }}
      transition={{ duration, ease: 'linear', delay }}
      onAnimationComplete={() => onComplete(id)}
      className="absolute text-accent" // text-accent gives the yellow color
      style={{ fontSize: `${Math.random() * 1.2 + 0.8}rem` }} // 0.8rem to 2rem
    >
      <Coins className="fill-accent drop-shadow-lg" />
    </motion.div>
  );
};

export function FallingCoins({ isActive, onAnimationEnd, count = 30 }: FallingCoinsProps) {
  const [activeCoins, setActiveCoins] = useState<number[]>([]);
  
  useEffect(() => {
    if (isActive) {
      // Create a new set of coins each time it's active
      setActiveCoins(Array.from({ length: count }, (_, i) => Date.now() + i));
    }
  }, [isActive, count]);

  const handleCoinAnimationComplete = useCallback((completedId: number) => {
    setActiveCoins(prevCoins => {
      const newCoins = prevCoins.filter(id => id !== completedId);
      if (newCoins.length === 0 && prevCoins.length > 0) { // Check prevCoins.length to ensure it was triggered
        onAnimationEnd();
      }
      return newCoins;
    });
  }, [onAnimationEnd]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden" aria-hidden="true">
      <AnimatePresence>
        {activeCoins.map(coinId => (
          <Coin key={coinId} id={coinId} onComplete={handleCoinAnimationComplete} />
        ))}
      </AnimatePresence>
    </div>
  );
}
