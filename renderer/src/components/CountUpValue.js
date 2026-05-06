import React, { useEffect, useMemo, useState } from 'react';

function CountUpValue({
  value = 0,
  duration = 700,
  formatter
}) {
  const target = Number(value) || 0;
  const [displayValue, setDisplayValue] = useState(target);

  useEffect(() => {
    let frameId;
    let startTime;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(target * eased);
      if (progress < 1) frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [target, duration]);

  const rendered = useMemo(() => {
    if (typeof formatter === 'function') return formatter(displayValue);
    return Math.round(displayValue).toLocaleString();
  }, [displayValue, formatter]);

  return <>{rendered}</>;
}

export default CountUpValue;
