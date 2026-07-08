// Quick daily drawdown check for account 295747472
// Uses positions sorted by close time to reconstruct daily balance

interface P { closeTime: string; profit: number; positionId: string; symbol: string; }

const positions: P[] = [
  // Apr 20 (open bal: 50.00)
  { closeTime: '2026-04-20 10:19:58', profit: 20.00, positionId: '202348174', symbol: 'XAU' },
  { closeTime: '2026-04-20 12:27:49', profit: 0.00, positionId: '202464355', symbol: 'XAU' },
  { closeTime: '2026-04-20 14:51:06', profit: -5.00, positionId: '202492195', symbol: 'XAU' },
  { closeTime: '2026-04-20 15:36:27', profit: -5.00, positionId: '202563974', symbol: 'XAU' },
  { closeTime: '2026-04-20 19:51:17', profit: 5.72, positionId: '202349654', symbol: 'EUR' },
  // Apr 21 (position 202583896 closes here from prev day)
  { closeTime: '2026-04-21 02:21:04', profit: 0.00, positionId: '202583896', symbol: 'XAU' },
  { closeTime: '2026-04-21 04:50:07', profit: -5.00, positionId: '202664252', symbol: 'XAU' },
  { closeTime: '2026-04-21 07:00:55', profit: -0.30, positionId: '202669882', symbol: 'EUR' },
  { closeTime: '2026-04-21 08:52:46', profit: -5.00, positionId: '202741972', symbol: 'XAU' },
  // Apr 22
  { closeTime: '2026-04-22 03:38:15', profit: -5.00, positionId: '203062658', symbol: 'XAU' },
  { closeTime: '2026-04-22 08:36:18', profit: -5.00, positionId: '203060670', symbol: 'XAU' },
  // Apr 23
  { closeTime: '2026-04-23 10:15:22', profit: -5.00, positionId: '203508058', symbol: 'XAU' },
  { closeTime: '2026-04-23 10:57:40', profit: -5.00, positionId: '203520039', symbol: 'XAU' },
  { closeTime: '2026-04-23 12:40:56', profit: 2.46, positionId: '203408436', symbol: 'EUR' },
  { closeTime: '2026-04-23 12:45:56', profit: -2.29, positionId: '203569412', symbol: 'XAU' },
  // Apr 24
  { closeTime: '2026-04-24 08:21:06', profit: -5.00, positionId: '203793927', symbol: 'XAU' },
  { closeTime: '2026-04-24 09:38:41', profit: -1.86, positionId: '203817957', symbol: 'EUR' },
  { closeTime: '2026-04-24 09:42:40', profit: -3.22, positionId: '203877151', symbol: 'XAU' },
  // Apr 27
  { closeTime: '2026-04-27 07:11:26', profit: 5.01, positionId: '204259241', symbol: 'XAU' },
  { closeTime: '2026-04-27 08:35:26', profit: 2.70, positionId: '204259696', symbol: 'EUR' },
  { closeTime: '2026-04-27 08:44:27', profit: -5.00, positionId: '204310859', symbol: 'XAU' },
  { closeTime: '2026-04-27 08:48:23', profit: -2.30, positionId: '204314939', symbol: 'XAU' },
  { closeTime: '2026-04-27 12:16:44', profit: 0.31, positionId: '204317470', symbol: 'XAU' },
  { closeTime: '2026-04-27 13:10:53', profit: -5.00, positionId: '204406854', symbol: 'XAU' },
  { closeTime: '2026-04-27 15:00:55', profit: 14.55, positionId: '204435786', symbol: 'XAU' },
  { closeTime: '2026-04-27 15:11:00', profit: -5.00, positionId: '204475315', symbol: 'XAU' },
  { closeTime: '2026-04-27 15:29:41', profit: -5.00, positionId: '204482804', symbol: 'XAU' },
  { closeTime: '2026-04-27 15:41:07', profit: -5.00, positionId: '204489438', symbol: 'XAU' },
  { closeTime: '2026-04-27 16:05:09', profit: -5.00, positionId: '204497602', symbol: 'XAU' },
  // Apr 28
  { closeTime: '2026-04-28 07:48:32', profit: 15.60, positionId: '204655239', symbol: 'XAU' },
  { closeTime: '2026-04-28 07:57:26', profit: -5.00, positionId: '204667052', symbol: 'XAU' },
  { closeTime: '2026-04-28 08:06:59', profit: -5.00, positionId: '204673579', symbol: 'XAU' },
  { closeTime: '2026-04-28 08:09:04', profit: -5.00, positionId: '204676158', symbol: 'XAU' },
  { closeTime: '2026-04-28 08:19:07', profit: -5.00, positionId: '204680204', symbol: 'XAU' },
  { closeTime: '2026-04-28 09:39:42', profit: 36.39, positionId: '204690184', symbol: 'XAU' },
  { closeTime: '2026-04-28 10:19:49', profit: -5.00, positionId: '204715129', symbol: 'XAU' },
  { closeTime: '2026-04-28 11:23:35', profit: -8.09, positionId: '204747253', symbol: 'XAU' },
  { closeTime: '2026-04-28 12:12:17', profit: 34.00, positionId: '204750874', symbol: 'XAU' },
  { closeTime: '2026-04-28 13:42:25', profit: 18.00, positionId: '204800912', symbol: 'XAU' },
  { closeTime: '2026-04-28 14:04:59', profit: 25.00, positionId: '204834025', symbol: 'XAU' },
  { closeTime: '2026-04-28 14:55:54', profit: -10.63, positionId: '204865943', symbol: 'XAU' },
  { closeTime: '2026-04-28 17:11:47', profit: -5.00, positionId: '204905559', symbol: 'XAU' },
  { closeTime: '2026-04-28 19:01:07', profit: -5.00, positionId: '204930322', symbol: 'XAU' },
  { closeTime: '2026-04-28 20:04:48', profit: -5.00, positionId: '204939340', symbol: 'XAU' },
  // Apr 29 (68 trades - summarized by close time)
  { closeTime: '2026-04-29 05:40:57', profit: -5.00, positionId: '205027413', symbol: 'XAU' },
  { closeTime: '2026-04-29 05:53:27', profit: -5.00, positionId: '205030885', symbol: 'XAU' },
  { closeTime: '2026-04-29 07:10:05', profit: 22.74, positionId: '205037357', symbol: 'XAU' },
  { closeTime: '2026-04-29 08:20:06', profit: 16.07, positionId: '205059639', symbol: 'XAU' },
  { closeTime: '2026-04-29 08:46:00', profit: -5.00, positionId: '205086192', symbol: 'XAU' },
  { closeTime: '2026-04-29 09:18:07', profit: -5.00, positionId: '205102867', symbol: 'XAU' },
  { closeTime: '2026-04-29 10:03:39', profit: -5.00, positionId: '205118920', symbol: 'XAU' },
  { closeTime: '2026-04-29 10:21:21', profit: -5.00, positionId: '205133825', symbol: 'XAU' },
  { closeTime: '2026-04-29 10:25:00', profit: -5.00, positionId: '205135095', symbol: 'XAU' },
  { closeTime: '2026-04-29 12:51:55', profit: 40.00, positionId: '205140456', symbol: 'XAU' },
  { closeTime: '2026-04-29 13:13:02', profit: -5.00, positionId: '205202008', symbol: 'XAU' },
  { closeTime: '2026-04-29 13:41:06', profit: 8.43, positionId: '205222805', symbol: 'XAU' },
  { closeTime: '2026-04-29 13:55:39', profit: -5.00, positionId: '205224441', symbol: 'XAU' },
  { closeTime: '2026-04-29 14:13:03', profit: -5.00, positionId: '205241858', symbol: 'XAU' },
  { closeTime: '2026-04-29 14:33:15', profit: -5.00, positionId: '205251823', symbol: 'XAU' },
  { closeTime: '2026-04-29 14:54:29', profit: -5.00, positionId: '205268234', symbol: 'XAU' },
  { closeTime: '2026-04-29 15:17:14', profit: -5.00, positionId: '205278806', symbol: 'XAU' },
  { closeTime: '2026-04-29 16:03:22', profit: -5.00, positionId: '205282647', symbol: 'XAU' },
  { closeTime: '2026-04-29 16:03:22', profit: -5.00, positionId: '205282802', symbol: 'XAU' },
  { closeTime: '2026-04-29 16:12:33', profit: -5.00, positionId: '205306160', symbol: 'XAU' },
  { closeTime: '2026-04-29 16:15:28', profit: -5.00, positionId: '205308124', symbol: 'XAU' },
  { closeTime: '2026-04-29 16:30:00', profit: -5.00, positionId: '205311749', symbol: 'XAU' },
  { closeTime: '2026-04-29 18:36:19', profit: 36.00, positionId: '205315327', symbol: 'XAU' },
  { closeTime: '2026-04-29 19:46:42', profit: -5.00, positionId: '205395365', symbol: 'XAU' },
  { closeTime: '2026-04-29 20:31:05', profit: -5.00, positionId: '205405669', symbol: 'XAU' },
  { closeTime: '2026-04-29 20:39:27', profit: -5.00, positionId: '205407193', symbol: 'XAU' },
  { closeTime: '2026-04-29 23:52:03', profit: -5.00, positionId: '205382082', symbol: 'XAU' },
  // Apr 30 (many trades)
  { closeTime: '2026-04-30 05:08:03', profit: -5.00, positionId: '205468080', symbol: 'XAU' },
  { closeTime: '2026-04-30 06:55:12', profit: -5.00, positionId: '205501356', symbol: 'XAU' },
  { closeTime: '2026-04-30 06:58:06', profit: -4.18, positionId: '205512158', symbol: 'XAU' },
  { closeTime: '2026-04-30 07:00:16', profit: -5.00, positionId: '205512590', symbol: 'XAU' },
  { closeTime: '2026-04-30 08:19:54', profit: 51.20, positionId: '205527384', symbol: 'XAU' },
  { closeTime: '2026-04-30 08:37:00', profit: -5.00, positionId: '205559093', symbol: 'XAU' },
  { closeTime: '2026-04-30 11:33:20', profit: 18.00, positionId: '205587048', symbol: 'XAU' },
  { closeTime: '2026-04-30 12:16:21', profit: -8.58, positionId: '205655806', symbol: 'XAU' },
  { closeTime: '2026-04-30 13:05:37', profit: -8.13, positionId: '205682068', symbol: 'XAU' },
  { closeTime: '2026-04-30 13:10:45', profit: -5.00, positionId: '205685322', symbol: 'XAU' },
  { closeTime: '2026-04-30 13:41:46', profit: -5.00, positionId: '205644093', symbol: 'XAU' },
  { closeTime: '2026-04-30 14:01:14', profit: -5.00, positionId: '205715711', symbol: 'XAU' },
  { closeTime: '2026-04-30 14:09:54', profit: -5.00, positionId: '205726334', symbol: 'XAU' },
  { closeTime: '2026-04-30 14:18:26', profit: -5.00, positionId: '205732298', symbol: 'XAU' },
  { closeTime: '2026-04-30 15:33:40', profit: -5.00, positionId: '205766506', symbol: 'XAU' },
  { closeTime: '2026-04-30 15:38:04', profit: -5.00, positionId: '205767997', symbol: 'XAU' },
  { closeTime: '2026-04-30 15:38:23', profit: -5.00, positionId: '205768081', symbol: 'XAU' },
  { closeTime: '2026-04-30 17:11:34', profit: -5.00, positionId: '205771148', symbol: 'XAU' },
  { closeTime: '2026-04-30 17:21:00', profit: -5.00, positionId: '205771170', symbol: 'XAU' },
  { closeTime: '2026-04-30 17:29:06', profit: -5.00, positionId: '205805499', symbol: 'XAU' },
  { closeTime: '2026-04-30 18:14:47', profit: -5.00, positionId: '205816453', symbol: 'XAU' },
  { closeTime: '2026-04-30 18:16:09', profit: 0.11, positionId: '205817908', symbol: 'XAU' },
  { closeTime: '2026-04-30 18:29:34', profit: -5.00, positionId: '205817972', symbol: 'XAU' },
  { closeTime: '2026-04-30 18:56:39', profit: 4.42, positionId: '205805471', symbol: 'XAU' },
  { closeTime: '2026-04-30 19:20:00', profit: -5.00, positionId: '205825827', symbol: 'XAU' },
  // May 1 (many trades)
  { closeTime: '2026-05-01 04:07:15', profit: -5.00, positionId: '205893835', symbol: 'XAU' },
  { closeTime: '2026-05-01 05:08:29', profit: -5.00, positionId: '205902540', symbol: 'XAU' },
  { closeTime: '2026-05-01 05:17:38', profit: -5.00, positionId: '205905682', symbol: 'XAU' },
  { closeTime: '2026-05-01 05:18:02', profit: -5.00, positionId: '205905670', symbol: 'XAU' },
  { closeTime: '2026-05-01 05:21:59', profit: -5.00, positionId: '205906714', symbol: 'XAU' },
  { closeTime: '2026-05-01 05:27:00', profit: -5.00, positionId: '205907225', symbol: 'XAU' },
  { closeTime: '2026-05-01 05:48:40', profit: -5.00, positionId: '205910863', symbol: 'XAU' },
  { closeTime: '2026-05-01 08:32:25', profit: 81.00, positionId: '205912978', symbol: 'XAU' },
  { closeTime: '2026-05-01 09:22:52', profit: -5.00, positionId: '205973352', symbol: 'XAU' },
  { closeTime: '2026-05-01 11:09:02', profit: -5.00, positionId: '206012561', symbol: 'XAU' },
  { closeTime: '2026-05-01 11:18:39', profit: -5.00, positionId: '206015085', symbol: 'XAU' },
  { closeTime: '2026-05-01 11:41:16', profit: -5.00, positionId: '206021868', symbol: 'XAU' },
  { closeTime: '2026-05-01 12:43:09', profit: 10.00, positionId: '206038593', symbol: 'XAU' },
  { closeTime: '2026-05-01 13:29:23', profit: -5.00, positionId: '206060759', symbol: 'XAU' },
  { closeTime: '2026-05-01 13:31:40', profit: 14.63, positionId: '206032478', symbol: 'XAU' },
  { closeTime: '2026-05-01 14:19:11', profit: 56.77, positionId: '206078372', symbol: 'XAU' },
  { closeTime: '2026-05-01 14:25:26', profit: 54.20, positionId: '206078440', symbol: 'XAU' },
  { closeTime: '2026-05-01 14:40:11', profit: -5.00, positionId: '206128652', symbol: 'XAU' },
  { closeTime: '2026-05-01 14:41:00', profit: -5.73, positionId: '206128634', symbol: 'XAU' },
  { closeTime: '2026-05-01 15:46:10', profit: 25.00, positionId: '206130526', symbol: 'XAU' },
  { closeTime: '2026-05-01 15:50:30', profit: -5.00, positionId: '206157020', symbol: 'XAU' },
  { closeTime: '2026-05-01 15:50:35', profit: 13.55, positionId: '206130351', symbol: 'XAU' },
  { closeTime: '2026-05-01 16:30:01', profit: -5.00, positionId: '206163327', symbol: 'XAU' },
  { closeTime: '2026-05-01 16:30:02', profit: -5.00, positionId: '206163310', symbol: 'XAU' },
  { closeTime: '2026-05-01 18:05:09', profit: -5.00, positionId: '206172737', symbol: 'XAU' },
  { closeTime: '2026-05-01 18:05:09', profit: -5.00, positionId: '206172856', symbol: 'XAU' },
  { closeTime: '2026-05-01 18:21:01', profit: -5.00, positionId: '206198787', symbol: 'XAU' },
  { closeTime: '2026-05-01 18:21:07', profit: -5.00, positionId: '206198743', symbol: 'XAU' },
  { closeTime: '2026-05-01 18:50:39', profit: -5.00, positionId: '206201812', symbol: 'XAU' },
  { closeTime: '2026-05-01 18:50:39', profit: -5.00, positionId: '206201824', symbol: 'XAU' },
  { closeTime: '2026-05-01 20:43:57', profit: 3.94, positionId: '206215042', symbol: 'XAU' },
  { closeTime: '2026-05-01 20:44:01', profit: 4.24, positionId: '206215059', symbol: 'XAU' },
];

function dateKey(s: string): string {
  return s.substring(0, 10);
}

// Group by close day
const byDay = new Map<string, P[]>();
positions.forEach(p => {
  const dk = dateKey(p.closeTime);
  if (!byDay.has(dk)) byDay.set(dk, []);
  byDay.get(dk)!.push(p);
});

let runBal = 50.00;
const days = [...byDay.keys()].sort();

for (const day of days) {
  const openBal = runBal;
  const dayPos = byDay.get(day)!;
  let cur = openBal;
  let minBal = openBal;
  let breached = false;
  let breachPoint = '';
  const flaggedAfter: string[] = [];

  for (const p of dayPos) {
    cur += p.profit;
    if (cur < minBal) minBal = cur;
    const dd = openBal - cur;
    if (dd >= 10 && !breached) {
      breached = true;
      breachPoint = `DD=$${dd.toFixed(2)} at bal=$${cur.toFixed(2)}`;
    }
    if (breached && p.profit > 0) {
      flaggedAfter.push(`${p.positionId} +$${p.profit.toFixed(2)}`);
    }
  }

  const dd = openBal - minBal;
  const status = dd >= 10 ? '❌' : '✅';
  console.log(`${status} ${day}: Open=$${openBal.toFixed(2)} MinBal=$${minBal.toFixed(2)} DD=$${dd.toFixed(2)} Close=$${cur.toFixed(2)}`);
  if (breached) {
    console.log(`  ⚠️ Breach: ${breachPoint}`);
    if (flaggedAfter.length > 0) {
      console.log(`  Profits after breach (REMOVED):`);
      flaggedAfter.forEach(f => console.log(`    ${f}`));
    }
  }
  runBal = cur;
}
console.log(`\nFinal balance: $${runBal.toFixed(2)}`);
