const CURRENCY_MINOR_UNITS=Object.freeze({ETB:2,USD:2});
export function toChapaMinorUnits(amount,currency) {
  const code=String(currency||"").trim().toUpperCase();
  const digits=CURRENCY_MINOR_UNITS[code];
  if(digits===undefined)throw new Error("Chapa does not document minor-unit handling for currency "+code+".");
  const value=Number(amount);
  if(!Number.isFinite(value)||value<=0)throw new Error("Chapa payment amount must be a positive number.");
  const scale=10**digits;
  const minor=Math.round(value*scale);
  if(!Number.isSafeInteger(minor)||minor<100||Math.abs(value*scale-minor)>1e-7)throw new Error("Chapa payment amount is below the minimum or has unsupported fractional precision.");
  return minor;
}
