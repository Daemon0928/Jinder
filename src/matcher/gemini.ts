import { GoogleGenAI, Type } from "@google/genai";
import db from "../db/database";
import axios from "axios";
import { MatchResult, BatchMatchInput, BatchMatchResult } from "../types";

export type { MatchResult, BatchMatchInput, BatchMatchResult };

// Gemini model from .env
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

// One client for the process — construction is cheap but there's no reason
// to repeat it per call.
let aiClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// Retrieve the CV from the configuration table
export function getCVText(): string {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get("cv") as
    | { value: string }
    | undefined;
  return row ? row.value : "";
}

/**
 * In MOCK_GEMINI mode the e2e mock server can override responses via
 * dynamic "mock rules". Returns the rules object, or null when unavailable.
 */
async function fetchMockRules(caller: string): Promise<any | null> {
  try {
    const mockServerUrl = process.env.PROFESSION_BASE_URL || 'http://localhost:5001';
    const res = await axios.get(`${mockServerUrl}/api/test/mock-rules`, { timeout: 2000 });
    return res.data ?? null;
  } catch (err: any) {
    console.warn(`Failed to query dynamic mock rules for ${caller}:`, err.message);
    return null;
  }
}

/**
 * Summarize raw CV text into a structured markdown summary using Gemini.
 * Returns a concise summary suitable for display and for use as context
 * in job-matching prompts.
 */
export async function summarizeCv(rawText: string): Promise<string | null> {
  if (process.env.MOCK_GEMINI === 'true') {
    const rules = await fetchMockRules('summarizeCv');
    if (rules && rules.geminiSummarizeStatus !== undefined) {
      if (rules.geminiSummarizeStatus === 200) {
        return rules.geminiSummarizePayload || null;
      }
      console.warn(`Mock Gemini summarize failed with status ${rules.geminiSummarizeStatus}`);
    }

    return `## Professional Summary
Deterministic mock CV summary.

## Key Skills & Technologies
- TypeScript
- React
- Node.js

## Education
- Bachelor of Computer Science`;
  }

  const ai = getClient();
  if (!ai) {
    console.warn("GEMINI_API_KEY is not set. Skipping CV summarization.");
    return null;
  }

  const prompt = `
You are a career assistant. The user has uploaded their CV. The raw text was extracted from a PDF and may contain formatting artefacts, extra whitespace, or mixed languages (Hungarian/English).

Clean up and summarize the CV into a well-structured markdown document. Use these sections:

## Professional Summary
(2-3 sentences summarizing who this person is, their seniority level, and key domain)

## Key Skills & Technologies
(Bullet list of technologies, frameworks, tools, and programming languages)

## Experience Highlights
(Bullet list of the most relevant roles with company, title, and 1-line description)

## Education
(Bullet list of degrees/certifications)

## Languages
(Spoken/written languages and proficiency)

Keep the output concise (under 400 words). Translate any Hungarian content to English. If a section has no information, omit it.

Raw CV text:
===
${rawText}
===
`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });

    const text = response.text;
    if (!text) throw new Error("No text returned from Gemini API");

    return text.trim();
  } catch (error) {
    console.error("Error during CV summarization:", error);
    return null;
  }
}

export async function matchJobWithGemini(
  jobTitle: string,
  jobCompany: string,
  rawHtmlOrText: string,
  cvTextOverride?: string,
): Promise<MatchResult | null> {
  if (process.env.MOCK_GEMINI === 'true') {
    const rules = await fetchMockRules('matchJobWithGemini');
    if (rules) {
      if (rules.geminiStatus !== undefined && rules.geminiStatus !== 200) {
        console.warn(`Mock Gemini match failed with status ${rules.geminiStatus}`);
      } else if (rules.geminiPayload) {
        return rules.geminiPayload;
      }
    }

    let score = 45;
    const scoreMatch = jobTitle.match(/\(Score:\s*(\d+)\)/i);
    if (scoreMatch) {
      score = parseInt(scoreMatch[1], 10);
    } else {
      const lowerTitle = jobTitle.toLowerCase();
      if (lowerTitle.includes('typescript') || lowerTitle.includes('react') || lowerTitle.includes('senior')) {
        score = 85;
      }
    }

    return {
      matchScore: score,
      pros: ['Mock Pro 1', 'Mock Pro 2'],
      cons: ['Mock Con 1'],
      justification: 'This is a mock justification for the job match.',
      parsedJob: {
        title: jobTitle,
        company: jobCompany,
        location: 'Budapest',
        description: 'This is a mock description extracted from the posting.',
        techStack: ['TypeScript', 'React'],
        salary: '1200000 HUF'
      }
    };
  }

  const ai = getClient();
  if (!ai) {
    console.warn("GEMINI_API_KEY is not set. Skipping semantic match.");
    return null;
  }

  const cvText = cvTextOverride ?? getCVText();
  if (!cvText) {
    console.warn("CV text is not set in config. Skipping matching logic.");
    return null;
  }

  const prompt = `
You are a career assistant helping a software developer find jobs in Hungary.
Your task is to analyze the provided job posting text (which might be in Hungarian, English, or a mix of both) and compare it against the user's CV.

Here is the user's CV:
===
${cvText}
===

Job Title: ${jobTitle}
Company: ${jobCompany}
Job posting content (HTML/text):
===
${rawHtmlOrText}
===

Perform the following tasks:
1. Parse the job listing into clean, structured details (title, company, location, simplified description, tech stack, and salary if mentioned). If the listing is in Hungarian, please translate these parsed details to English for the user.
2. Evaluate the match between the job description and the user's CV. Provide a matchScore (0 to 100). CRITICAL: Lack of experience or seniority must carry heavy weight. If there is a significant discrepancy between the user's years of experience and the job's required years of experience (for example, if the job requires 5+ years of experience but the user has only 3 years, or generally if the user lacks the required seniority/experience level), the matchScore MUST NOT exceed 75% (it must be capped at 75% maximum).
3. List 2-4 pros (reasons why it's a good match).
4. List 2-4 cons or missing requirements (technologies or experiences required/preferred that the user lacks or doesn't emphasize in their CV).
5. Provide a 2-3 sentence justification explaining the overall rating.
`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matchScore: {
              type: Type.INTEGER,
              description: "Score between 0 and 100 indicating match quality",
            },
            pros: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Points where the user matches well",
            },
            cons: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Points where the user lacks requirements",
            },
            justification: {
              type: Type.STRING,
              description: "A short explanation of the match score",
            },
            parsedJob: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "Translated job title (English)",
                },
                company: { type: Type.STRING },
                location: {
                  type: Type.STRING,
                  description: "Translated location/city (English)",
                },
                description: {
                  type: Type.STRING,
                  description:
                    "A brief, 2-3 sentence summary of the job role (English)",
                },
                techStack: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Keywords of technical stack required",
                },
                salary: {
                  type: Type.STRING,
                  description: "Salary info if found, else empty",
                },
              },
              required: [
                "title",
                "company",
                "location",
                "description",
                "techStack",
                "salary",
              ],
            },
          },
          required: [
            "matchScore",
            "pros",
            "cons",
            "justification",
            "parsedJob",
          ],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No text returned from Gemini API");

    return JSON.parse(text) as MatchResult;
  } catch (error) {
    console.error("Error during Gemini job matching:", error);
    return null;
  }
}

/**
 * Match a batch of jobs with Gemini in a single API call to optimize tokens and API costs.
 */
export async function matchJobsBatchWithGemini(
  jobs: BatchMatchInput[],
  cvTextOverride?: string,
): Promise<BatchMatchResult[] | null> {
  if (jobs.length === 0) return [];

  if (process.env.MOCK_GEMINI === 'true') {
    const rules = await fetchMockRules('matchJobsBatchWithGemini');
    if (rules) {
      if (rules.geminiStatus !== undefined && rules.geminiStatus !== 200) {
        console.warn(`Mock Gemini batch match failed with status ${rules.geminiStatus}`);
      } else if (rules.geminiPayload) {
        return jobs.map((_, idx) => ({
          ...rules.geminiPayload,
          index: idx
        }));
      }
    }

    return jobs.map((job, idx) => {
      let score = 45;
      const scoreMatch = job.title.match(/\(Score:\s*(\d+)\)/i);
      if (scoreMatch) {
        score = parseInt(scoreMatch[1], 10);
      } else {
        const lowerTitle = job.title.toLowerCase();
        if (lowerTitle.includes('typescript') || lowerTitle.includes('react') || lowerTitle.includes('senior')) {
          score = 85;
        }
      }
      return {
        index: idx,
        matchScore: score,
        pros: ['Mock Pro 1', 'Mock Pro 2'],
        cons: ['Mock Con 1'],
        justification: 'This is a mock justification for the job match.',
        parsedJob: {
          title: job.title,
          company: job.company,
          location: 'Budapest',
          description: 'This is a mock description extracted from the posting.',
          techStack: ['TypeScript', 'React'],
          salary: '1200000 HUF'
        }
      };
    });
  }

  const ai = getClient();
  if (!ai) {
    console.warn("GEMINI_API_KEY is not set. Skipping batch semantic match.");
    return null;
  }

  const cvText = cvTextOverride ?? getCVText();
  if (!cvText) {
    console.warn("CV text is not set in config. Skipping matching logic.");
    return null;
  }

  const jobsFormatted = jobs.map((job, idx) => `
Job Index: ${idx}
Job Title: ${job.title}
Company: ${job.company}
Job posting content (HTML/text):
===
${job.description}
===
`).join('\n---\n');

  const prompt = `
You are a career assistant helping a software developer find jobs in Hungary. 
Your task is to analyze the provided list of job postings (which might be in Hungarian, English, or a mix of both) and compare each of them against the user's CV.

Here is the user's CV:
===
${cvText}
===

Here are the job listings to analyze:
${jobsFormatted}

Perform the following tasks for each job in the list:
1. Identify the job by its "index" (the 0-based Job Index provided in the list).
2. Parse the job listing into clean, structured details (title, company, location, simplified description, tech stack, and salary if mentioned). If the listing is in Hungarian, please translate these parsed details to English for the user.
3. Evaluate the match between the job description and the user's CV. Provide a matchScore (0 to 100). CRITICAL: Lack of experience or seniority must carry heavy weight. If there is a significant discrepancy between the user's years of experience and the job's required years of experience (for example, if the job requires 5+ years of experience but the user has only 3 years, or generally if the user lacks the required seniority/experience level), the matchScore MUST NOT exceed 75% (it must be capped at 75% maximum).
4. List 2-4 pros (reasons why it's a good match).
5. List 2-4 cons or missing requirements (technologies or experiences required/preferred that the user lacks or doesn't emphasize in their CV).
6. Provide a 2-3 sentence justification explaining the overall rating.

You must return a JSON array containing the analysis for each job. The elements of the array must match the order and indexes of the input jobs.
`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              index: {
                type: Type.INTEGER,
                description: "The 0-based Job Index of the job from the input list",
              },
              matchScore: {
                type: Type.INTEGER,
                description: "Score between 0 and 100 indicating match quality",
              },
              pros: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Points where the user matches well",
              },
              cons: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Points where the user lacks requirements",
              },
              justification: {
                type: Type.STRING,
                description: "A short explanation of the match score",
              },
              parsedJob: {
                type: Type.OBJECT,
                properties: {
                  title: {
                    type: Type.STRING,
                    description: "Translated job title (English)",
                  },
                  company: { type: Type.STRING },
                  location: {
                    type: Type.STRING,
                    description: "Translated location/city (English)",
                  },
                  description: {
                    type: Type.STRING,
                    description:
                      "A brief, 2-3 sentence summary of the job role (English)",
                  },
                  techStack: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Keywords of technical stack required",
                  },
                  salary: {
                    type: Type.STRING,
                    description: "Salary info if found, else empty",
                  },
                },
                required: [
                  "title",
                  "company",
                  "location",
                  "description",
                  "techStack",
                  "salary",
                ],
              },
            },
            required: [
              "index",
              "matchScore",
              "pros",
              "cons",
              "justification",
              "parsedJob",
            ],
          },
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No text returned from Gemini API");

    return JSON.parse(text) as BatchMatchResult[];
  } catch (error) {
    console.error("Error during Gemini batch job matching:", error);
    return null;
  }
}

/**
 * Use Gemini to inspect link URLs and text to identify individual job posting URLs.
 */
export async function extractJobLinksWithGemini(
  pageUrl: string,
  candidateLinks: { href: string; text: string }[]
): Promise<string[] | null> {
  if (candidateLinks.length === 0) return [];

  if (process.env.MOCK_GEMINI === 'true') {
    return candidateLinks
      .filter(link => {
        const lowerUrl = link.href.toLowerCase();
        return (
          lowerUrl.includes('/job/') ||
          lowerUrl.includes('/jobs/') ||
          lowerUrl.includes('/job-') ||
          lowerUrl.includes('-job-') ||
          lowerUrl.includes('test-job-') ||
          lowerUrl.includes('/position/') ||
          lowerUrl.includes('/positions/') ||
          lowerUrl.includes('/career/') ||
          lowerUrl.includes('/careers/') ||
          lowerUrl.includes('/allas/') ||
          lowerUrl.includes('/opening/') ||
          lowerUrl.includes('/vacancy/')
        );
      })
      .map(l => l.href);
  }

  const ai = getClient();
  if (!ai) {
    console.warn("GEMINI_API_KEY is not set. Skipping LLM link extraction.");
    return null;
  }

  const prompt = `
You are a web scraping assistant. Your task is to analyze a list of candidate links extracted from a company's career page and identify which of them point to individual job posting detail pages (i.e. specific job vacancies like "Senior Software Engineer", "DevOps Intern", etc.).

Do NOT include general navigation links like "Home", "Privacy Policy", "Terms of Service", "About Us", "All Jobs", "Contact", "Categories", or department-filtered views. Only return URLs that point to a single, specific job description.

Career Page URL: ${pageUrl}

Candidate Links:
===
${JSON.stringify(candidateLinks.map(l => ({ url: l.href, text: l.text.trim() })))}
===

Return a JSON array containing only the URLs of the specific job postings.
`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "An array of URLs that point to individual job postings."
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No text returned from Gemini API");

    return JSON.parse(text) as string[];
  } catch (error) {
    console.error("Error during Gemini link extraction:", error);
    return null;
  }
}

