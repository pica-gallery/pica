export function nextAnimationFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export function delay(millis: number): Promise<void> {
  return new Promise(resolve => setTimeout(() => resolve(), millis));
}
