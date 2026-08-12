const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;

function extractVideoId(input) {
  try {
    if (!input) return null;

    input = input.trim();

    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
      return input;
    }

    const url = new URL(input);

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.slice(1).split(/[?/]/)[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
      return v;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.findIndex(part =>
      ["shorts", "embed", "live", "v"].includes(part)
    );

    if (
      index !== -1 &&
      parts[index + 1] &&
      /^[a-zA-Z0-9_-]{11}$/.test(parts[index + 1])
    ) {
      return parts[index + 1];
    }

    return null;
  } catch {
    return null;
  }
}

function formatTime(seconds) {
  const sec = Math.max(0, Math.floor(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${m}:${String(s).padStart(2, "0")}`;
}

const IDEOLOGIES = {
  general: {
    label: "General",
    keywords: [
      "how",
      "why",
      "what",
      "secret",
      "truth",
      "mistake",
      "lesson",
      "important",
      "nobody",
      "everyone",
      "stop",
      "start",
      "never",
      "always",
      "success",
      "life",
      "people",
      "mind",
      "idea",
      "story"
    ]
  },

  motivation: {
    label: "Motivation",
    keywords: [
      "discipline",
      "mindset",
      "success",
      "goal",
      "dream",
      "failure",
      "hard work",
      "consistency",
      "focus",
      "believe",
      "habit",
      "growth",
      "pain",
      "win",
      "lose",
      "strong",
      "future",
      "lazy",
      "action",
      "energy"
    ]
  },

  business: {
    label: "Business",
    keywords: [
      "business",
      "startup",
      "customer",
      "market",
      "product",
      "sales",
      "money",
      "profit",
      "brand",
      "strategy",
      "growth",
      "founder",
      "entrepreneur",
      "value",
      "offer",
      "pricing",
      "audience",
      "marketing",
      "scale",
      "leverage"
    ]
  },

  finance: {
    label: "Finance",
    keywords: [
      "money",
      "invest",
      "investment",
      "saving",
      "savings",
      "income",
      "wealth",
      "rich",
      "poor",
      "budget",
      "debt",
      "interest",
      "compound",
      "asset",
      "liability",
      "cashflow",
      "salary",
      "finance",
      "financial",
      "freedom"
    ]
  },

  education: {
    label: "Education",
    keywords: [
      "learn",
      "learning",
      "study",
      "student",
      "teach",
      "teacher",
      "knowledge",
      "skill",
      "exam",
      "school",
      "college",
      "degree",
      "career",
      "understand",
      "concept",
      "explain",
      "memory",
      "focus",
      "practice",
      "improve"
    ]
  },

  tech: {
    label: "Tech",
    keywords: [
      "ai",
      "artificial intelligence",
      "coding",
      "code",
      "software",
      "app",
      "developer",
      "programming",
      "machine",
      "data",
      "automation",
      "robot",
      "future",
      "internet",
      "computer",
      "technology",
      "startup",
      "tool",
      "product",
      "digital"
    ]
  },

  storytelling: {
    label: "Storytelling",
    keywords: [
      "story",
      "happened",
      "told",
      "life",
      "day",
      "night",
      "friend",
      "family",
      "moment",
      "changed",
      "realized",
      "suddenly",
      "then",
      "because",
      "but",
      "truth",
      "secret",
      "lesson",
      "experience",
      "journey"
    ]
  },

  custom: {
    label: "Custom",
    keywords: []
  }
};

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getTranscript(videoId) {
  const mod = await import("youtube-transcript");

  const YoutubeTranscript =
    mod.YoutubeTranscript ||
    (mod.default && mod.default.YoutubeTranscript) ||
    mod.default;

  return YoutubeTranscript.fetchTranscript(videoId);
}

function normalizeTranscript(rawTranscript) {
  const looksLikeMilliseconds = rawTranscript.some(
    item => Number(item.duration ?? 0) > 60
  );

  const toSeconds = value =>
    looksLikeMilliseconds ? Number(value) / 1000 : Number(value);

  return rawTranscript
    .map(item => {
      const text = (item.text || "").replace(/\s+/g, " ").trim();
      const start = toSeconds(item.offset ?? item.start ?? 0);
      const duration = toSeconds(item.duration ?? 4);

      return {
        text,
        start,
        end: start + duration
      };
    })
    .filter(item => item.text.length > 0);
}

function buildSegments(transcript, targetDuration = 45) {
  const segments = [];

  if (!transcript.length) return segments;

  const step = 5;

  for (let i = 0; i < transcript.length; i += step) {
    let text = "";
    let start = transcript[i].start;
    let end = start;

    for (let j = i; j < transcript.length; j++) {
      const item = transcript[j];
      const currentDuration = item.end - start;

      if (currentDuration > targetDuration) break;

      text += (text ? " " : "") + item.text;
      end = item.end;

      const duration = end - start;

      if (duration >= targetDuration * 0.8) {
        break;
      }
    }

    const duration = end - start;
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    if (duration >= 15 && duration <= 75 && wordCount >= 15) {
      segments.push({
        start,
        end,
        duration,
        text: text.trim()
      });
    }
  }

  return segments;
}

function scoreSegment(segment, keywords) {
  const text = segment.text.toLowerCase();
  let score = 0;
  const matchedKeywords = [];

  for (const keyword of keywords) {
    const cleanKeyword = keyword.toLowerCase().trim();

    if (!cleanKeyword) continue;

    const regex = new RegExp(`\\b${escapeRegex(cleanKeyword)}\\b`, "gi");
    const matches = text.match(regex);

    if (matches && matches.length > 0) {
      score += matches.length * 4;
      matchedKeywords.push(cleanKeyword);
    }
  }

  if (/[?!]/.test(segment.text)) score += 2;

  if (
    /how|why|what|secret|mistake|truth|nobody|stop|start|never|always|lesson|important/i.test(
      segment.text
    )
  ) {
    score += 3;
  }

  if (segment.duration >= 25 && segment.duration <= 55) {
    score += 4;
  }

  if (segment.duration < 15) {
    score -= 5;
  }

  if (segment.duration > 65) {
    score -= 3;
  }

  if (segment.text.split(/\s+/).length < 20) {
    score -= 3;
  }

  return {
    score,
    matchedKeywords: [...new Set(matchedKeywords)]
  };
}

function removeOverlaps(scoredSegments) {
  const sorted = [...scoredSegments].sort((a, b) => b.score - a.score);
  const kept = [];

  for (const segment of sorted) {
    const overlaps = kept.some(
      keptSegment =>
        segment.start < keptSegment.end && segment.end > keptSegment.start
    );

    if (!overlaps) {
      kept.push(segment);
    }
  }

  return kept;
}

function capitalizeFirst(string) {
  if (!string) return "";
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function generateTitle(segment, ideologyLabel, matchedKeywords) {
  const mainKeyword = matchedKeywords[0] || ideologyLabel.toLowerCase();

  const snippet = segment.text
    .split(/\s+/)
    .slice(0, 7)
    .join(" ");

  return `${capitalizeFirst(mainKeyword)} moment: ${snippet}...`;
}

function generateHashtags(ideologyKey, matchedKeywords) {
  const baseTags = {
    general: ["#shorts", "#video", "#content"],
    motivation: ["#shorts", "#motivation", "#mindset"],
    business: ["#shorts", "#business", "#startup"],
    finance: ["#shorts", "#finance", "#money"],
    education: ["#shorts", "#education", "#learning"],
    tech: ["#shorts", "#tech", "#ai"],
    storytelling: ["#shorts", "#story", "#storytime"],
    custom: ["#shorts", "#content"]
  };

  const tags = baseTags[ideologyKey] || baseTags.general;

  const keywordTags = matchedKeywords
    .slice(0, 3)
    .map(keyword => `#${keyword.replace(/\s+/g, "")}`);

  return [...tags, ...keywordTags].join(" ");
}

function generateReason(segment, matchedKeywords) {
  if (matchedKeywords.length > 0) {
    return `This segment matches the selected theme because it mentions: ${matchedKeywords
      .slice(0, 5)
      .join(", ")}.`;
  }

  return "This segment has a strong standalone statement that may work as a short.";
}

app.post("/api/generate", async (req, res) => {
  try {
    const {
      youtubeUrl,
      ideology = "general",
      customKeywords = "",
      numberOfShorts = 3,
      maxSeconds = 45
    } = req.body;

    const videoId = extractVideoId(youtubeUrl);

    if (!videoId) {
      return res.status(400).json({
        error: "Invalid YouTube URL or video ID."
      });
    }

    let rawTranscript;

    try {
      rawTranscript = await getTranscript(videoId);
    } catch {
      return res.status(400).json({
        error:
          "Could not fetch captions. Make sure the video has captions/transcript available."
      });
    }

    const transcript = normalizeTranscript(rawTranscript);

    if (!transcript.length) {
      return res.status(400).json({
        error: "No usable transcript found for this video."
      });
    }

    const selectedIdeology = IDEOLOGIES[ideology] || IDEOLOGIES.general;

    const customKeywordArray = customKeywords
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);

    const keywords = [
      ...selectedIdeology.keywords,
      ...customKeywordArray
    ];

    const targetDuration = Math.min(Number(maxSeconds) || 45, 60);

    const segments = buildSegments(transcript, targetDuration);

    if (!segments.length) {
      return res.status(400).json({
        error: "Could not find enough transcript segments to create shorts."
      });
    }

    const scoredSegments = segments.map(segment => {
      const { score, matchedKeywords } = scoreSegment(segment, keywords);

      return {
        ...segment,
        score,
        matchedKeywords
      };
    });

    const nonOverlapping = removeOverlaps(scoredSegments);

    const limit = Math.min(Number(numberOfShorts) || 3, 10);

    const topSegments = nonOverlapping
      .slice(0, limit)
      .map((segment, index) => {
        return {
          id: index + 1,
          title: generateTitle(
            segment,
            selectedIdeology.label,
            segment.matchedKeywords
          ),
          startTime: formatTime(segment.start),
          endTime: formatTime(segment.end),
          startSeconds: Number(segment.start.toFixed(2)),
          endSeconds: Number(segment.end.toFixed(2)),
          durationSeconds: Number(segment.duration.toFixed(2)),
          transcript: segment.text,
          hashtags: generateHashtags(ideology, segment.matchedKeywords),
          reason: generateReason(segment, segment.matchedKeywords),
          score: segment.score,
          matchedKeywords: segment.matchedKeywords,
          ffmpegCommand: `ffmpeg -ss ${segment.start.toFixed(
            2
          )} -to ${segment.end.toFixed(
            2
          )} -i input.mp4 -vf "crop=ih*9/16:ih,scale=1080:1920" -c:a copy short-${
            index + 1
          }.mp4`
        };
      });

    res.json({
      videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      ideology: selectedIdeology.label,
      numberOfShorts: topSegments.length,
      shorts: topSegments
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        "Something went wrong while processing the YouTube link. Please try another video with captions enabled."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
