// Local demo chord library. When a title matches, this progression is used.
// It will be replaced by AI analysis in Phase 2.
window.CHORD_DB = [
  {
    match: ["perfect", "ed sheeran"],
    title: "Perfect — Ed Sheeran",
    artist: "Ed Sheeran",
    key: "G",
    progression: ["G", "Em", "C", "D", "G", "Em", "C", "D"]
  },
  {
    match: ["tum hi ho", "arijit"],
    title: "Tum Hi Ho — Arijit Singh",
    artist: "Arijit Singh",
    key: "C",
    progression: ["C", "Em", "F", "G", "C", "Em", "F", "G"]
  },
  {
    match: ["let it be", "beatles"],
    title: "Let It Be — The Beatles",
    artist: "The Beatles",
    key: "C",
    progression: ["C", "G", "Am", "F", "C", "G", "F", "C"]
  },
  {
    match: ["kesariya", "brahmastra"],
    title: "Kesariya — Brahmastra",
    artist: "Arijit Singh",
    key: "C",
    progression: ["C", "G", "Am", "F", "C", "G", "F", "G"]
  },
  {
    match: ["apna time", "gully"],
    title: "Apna Time Aayega — Gully Boy",
    artist: "Ranveer Singh",
    key: "Am",
    progression: ["Am", "F", "C", "G", "Am", "F", "C", "G"]
  }
];

window.DEFAULT_PROGRESSION = ["C", "G", "Am", "F", "C", "G", "F", "G"];

window.DEMO_LYRICS_HI = `Tum hi ho ab tum hi to ho
Zindagi ab tum hi to ho
Chain bhi mera dard bhi
Meri aashiqui ab tum hi ho`;

window.DEMO_LYRICS_EN = `When I found myself in times of trouble
Mother Mary comes to me
Speaking words of wisdom, let it be
And in my hour of darkness
She is standing right in front of me
Speaking words of wisdom, let it be`;
