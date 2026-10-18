export function openAdminRegistration(c: any, now=Date.now()): boolean {
  const deadline=Math.min(+new Date(c.registration_deadline || c.start_date),+new Date(c.start_date));
  return c.host_id == null && (!c.source || c.source==='telegram') && c.status==='registration_open'
    && !c.configuration_frozen_at && Number.isFinite(deadline) && now<deadline;
}

export function additionalPostEligible(c: any, now=Date.now()): boolean {
  return c.host_id == null && (!c.source || c.source==='telegram') &&
    (openAdminRegistration(c,now) || c.status==='active');
}
