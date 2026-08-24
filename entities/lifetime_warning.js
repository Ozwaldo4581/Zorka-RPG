export function isVisibleForLifetimeWarning(age, remaining) {
    if (remaining <= 0) return false;
    if (remaining > 3) return true;
    const multiplier = remaining <= 0.5 ? 3 : remaining <= 1.5 ? 2 : 1;
    return Math.floor(age * 4 * multiplier * 2) % 2 === 0;
}
