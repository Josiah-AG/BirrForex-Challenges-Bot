import sys

path = '/Users/josiah-ag/Documents/IT Projects/TG Bots/BirrForex Challenges Bot/WinnerPip/winnerpip/app/challenge/[id]/page.tsx'
with open(path, 'r') as f:
    content = f.read()

# Replace rank badge with DQ check (2 occurrences)
old1 = 'entry.isDisqualified ? "bg-loss/20 text-loss" : entry.rank === 1 ? "bg-gold/20 text-gold" : entry.rank === 2 ? "bg-gray-400/20 text-gray-300" : entry.rank === 3 ? "bg-orange-500/20 text-orange-400" : "bg-white/5 text-gray-500"'
new1 = 'entry.isDisqualified ? "bg-loss/20 text-loss" : (challenge && entry.rank <= (challenge.winnersCount || 3) && entry.adjustedBalance >= challenge.targetBalance) ? "bg-gold/20 text-gold" : "bg-white/5 text-gray-500"'

count1 = content.count(old1)
content = content.replace(old1, new1)
print(f"Replaced rank badge (with DQ): {count1} occurrences")

# Replace rank badge without DQ check (leaderboard modal)
old2 = 'entry.rank === 1 ? "bg-gold/20 text-gold" : entry.rank === 2 ? "bg-gray-400/20 text-gray-300" : entry.rank === 3 ? "bg-orange-500/20 text-orange-400" : "bg-white/5 text-gray-500"'
new2 = '(challenge && entry.rank <= (challenge.winnersCount || 3) && entry.adjustedBalance >= challenge.targetBalance) ? "bg-gold/20 text-gold" : "bg-white/5 text-gray-500"'

count2 = content.count(old2)
content = content.replace(old2, new2)
print(f"Replaced rank badge (no DQ): {count2} occurrences")

# Add green shade for users above target on leaderboard rows
# The button has: ${entry.isMe ? "bg-royal/10 border-l-2 border-royal" : ""} ${entry.isDisqualified ? "opacity-60" : ""}
old3 = '${entry.isMe ? "bg-royal/10 border-l-2 border-royal" : ""} ${entry.isDisqualified ? "opacity-60" : ""}'
new3 = '${entry.isMe ? "bg-royal/10 border-l-2 border-royal" : (challenge && entry.adjustedBalance >= challenge.targetBalance && !entry.isDisqualified) ? "bg-profit/5 border-l-2 border-profit/30" : ""} ${entry.isDisqualified ? "opacity-60" : ""}'

count3 = content.count(old3)
content = content.replace(old3, new3)
print(f"Replaced button green shade: {count3} occurrences")

with open(path, 'w') as f:
    f.write(content)

print("Done!")
