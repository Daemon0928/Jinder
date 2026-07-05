/**
 * Seed the database with realistic demo data so a fresh checkout shows a
 * populated dashboard without API keys or a scrape run.
 *
 *   npm run seed:demo            (uses jobs.db, or DB_FILE if set)
 */
import db, { initDatabase } from '../src/db/database';

initDatabase();

const demoJobs = [
  { title: 'Senior TypeScript Developer', company: 'Shapr3D', location: 'Budapest', platform: 'nofluffjobs', score: 92, tech: ['TypeScript', 'React', 'Node.js'], salary: '1.4M – 1.8M HUF', pros: ['Strong TypeScript and React overlap', 'Product company with modern stack'], cons: ['CAD domain knowledge is new'], justification: 'Nearly all required technologies appear prominently in the CV; seniority matches.' },
  { title: 'Full-Stack Engineer (React/Node)', company: 'Prezi', location: 'Budapest', platform: 'career', score: 88, tech: ['React', 'Node.js', 'PostgreSQL'], salary: '', pros: ['Full-stack experience matches', 'English-speaking team'], cons: ['PostgreSQL depth unclear from CV'], justification: 'Excellent stack alignment with minor database gaps.' },
  { title: 'Frontend Fejlesztő', company: 'OTP Bank', location: 'Budapest', platform: 'profession', score: 74, tech: ['Angular', 'TypeScript'], salary: '900K – 1.2M HUF', pros: ['TypeScript expertise transfers', 'Stable employer'], cons: ['Angular instead of React', 'Banking compliance overhead'], justification: 'Solid fundamentals but the primary framework differs.' },
  { title: 'Java Backend Developer', company: 'Lufthansa Systems', location: 'Budapest', platform: 'profession', score: 45, tech: ['Java', 'Spring Boot'], salary: '', pros: ['Backend architecture experience'], cons: ['Java is not a CV strength', 'Requires 5+ years Java'], justification: 'Score capped by the experience gap in the required primary language.' },
  { title: 'DevOps Engineer', company: 'EPAM', location: 'Debrecen', platform: 'nofluffjobs', score: 58, tech: ['Kubernetes', 'AWS', 'Terraform'], salary: '1.1M – 1.5M HUF', pros: ['CI/CD familiarity', 'Cloud exposure'], cons: ['No dedicated infra role so far', 'Kubernetes production experience missing'], justification: 'Transferable skills but the role expects deeper infrastructure specialization.' },
  { title: 'React Native Developer', company: 'Bitrise', location: 'Remote', platform: 'nofluffjobs', score: 81, tech: ['React Native', 'TypeScript'], salary: '', pros: ['React knowledge transfers well', 'Remote-first team'], cons: ['Limited mobile-specific portfolio'], justification: 'Web React experience translates to React Native with a modest ramp-up.' },
  { title: 'Szoftverfejlesztő (C#/.NET)', company: 'Magyar Telekom', location: 'Budapest', platform: 'profession', score: 39, tech: ['C#', '.NET', 'SQL Server'], salary: '', pros: ['General engineering practices apply'], cons: ['No .NET on the CV', 'On-site only'], justification: 'Weak technology overlap with the CV.' },
  { title: 'Node.js Backend Engineer', company: 'SEON', location: 'Budapest', platform: 'career', score: 86, tech: ['Node.js', 'TypeScript', 'Redis'], salary: '1.3M – 1.6M HUF', pros: ['Direct Node.js/TypeScript match', 'Fraud-prevention domain is learnable'], cons: ['High-throughput systems experience unproven'], justification: 'Core stack is an excellent match; scale experience is the main open question.' },
];

// Spread demo jobs across the application pipeline so the board looks alive.
const statuses = ['new', 'interested', 'new', 'interview', 'new', 'applied', 'rejected', 'offer'];
const notes = ['', 'Reached out to recruiter on LinkedIn.', '', 'Tech interview scheduled for next week.', '', 'Submitted application via careers page.', 'Not a fit — Java-heavy.', 'Verbal offer received, reviewing package.'];

const insert = db.prepare(`
  INSERT OR IGNORE INTO jobs (
    job_id, platform, title, company, location, link, description,
    parsed_json, match_score, match_pros, match_cons, match_justification, status, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let inserted = 0;
demoJobs.forEach((job, i) => {
  const parsed = {
    title: job.title,
    company: job.company,
    location: job.location,
    description: `Demo listing for a ${job.title} role at ${job.company}.`,
    techStack: job.tech,
    salary: job.salary,
  };
  const info = insert.run(
    `demo-${i + 1}`,
    job.platform,
    job.title,
    job.company,
    job.location,
    `https://example.com/demo/${i + 1}`,
    `This is seeded demo data. ${job.title} at ${job.company} in ${job.location}. Tech: ${job.tech.join(', ')}.`,
    JSON.stringify(parsed),
    job.score,
    JSON.stringify(job.pros),
    JSON.stringify(job.cons),
    job.justification,
    statuses[i],
    notes[i],
  );
  inserted += Number(info.changes);
});

const config = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
config.run('keywords', JSON.stringify(['typescript', 'react', 'node']));
config.run('locations', JSON.stringify(['budapest', 'tavmunka']));
config.run('cv', 'Demo CV — replace with your own on the CV & Profile tab.');

console.log(`Seeded ${inserted} demo jobs. Start the app and open the dashboard.`);
db.close();
