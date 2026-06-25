export default function ScorePill({score}:{score:number}){const label=score>=85?"Strong":score>=75?"Good":score>=65?"Needs work":"Weak";return <span className="score-pill">{score} · {label}</span>}
