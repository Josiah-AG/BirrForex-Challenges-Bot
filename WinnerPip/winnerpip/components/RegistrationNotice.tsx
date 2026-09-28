export default function RegistrationNotice({accountType}:{accountType:string}) {
  return <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-left text-sm leading-relaxed text-gray-300">
    <p className="mb-4">Prepare your required starting balance before final verification, 2 or 3 hours before the challenge starts. Your dashboard shows the exact deadline. Keep the balance within the requirement until the challenge starts.</p>
    <h4 className="font-semibold text-amber-300">Keep your investor password unchanged</h4>
    <p className="mt-2">Do not change or generate a new investor password for your registered account during the challenge period. Password changes can interrupt trade tracking and may lead to disqualification.</p>
    {accountType === 'demo' && <><h4 className="mt-4 font-semibold text-amber-300">Keep your Exness demo account active</h4>
    <p className="mt-2">Exness may delete inactive demo accounts. As a precaution, place a pending order on one instrument well away from the current market price, then remove it when the challenge starts. Monitor the order because it could execute if the market reaches its price. This is not a guaranteed safeguard against deletion.</p>
    <p className="mt-2">If your account is deleted before the challenge starts, use <strong>Account Settings → Change account or category</strong> in your WinnerPip dashboard to replace and verify it. <strong>Account replacement is unavailable after the challenge starts.</strong></p></>}
  </div>;
}
