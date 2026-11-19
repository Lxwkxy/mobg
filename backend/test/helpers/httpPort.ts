export function randomHttpPort(): number {
  // Keep the random range away from fetch's blocked ports (including 6665-6669).
  return 7100 + Math.floor(Math.random() * 700);
}
