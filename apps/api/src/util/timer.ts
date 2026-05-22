import pc from "picocolors";
import { log } from "./log.js";

export const startTimer = (label: string) => {
    const startTime = performance.now();
    let minutes = 0;
    const interval = setInterval(() => {
        minutes++;
        log(`elapsed ${pc.yellow(String(minutes))} min`, label);
    }, 60000);
    return () => {
        const elapsed = performance.now() - startTime;
        log(`total ${pc.green(`${Math.round(elapsed / 1000)}s`)}`, label);
        clearInterval(interval);
    };
};
