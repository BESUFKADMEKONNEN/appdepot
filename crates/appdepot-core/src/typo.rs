//! Typo tolerance and human-error resilience.
//!
//! Provides Levenshtein distance matching, category typo correction,
//! application ID suggestions, and candidate file resolution.

use std::path::{Path, PathBuf};

/// Computes the Levenshtein distance between two string slices.
pub fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();

    let m = a_chars.len();
    let n = b_chars.len();

    if m == 0 {
        return n;
    }
    if n == 0 {
        return m;
    }

    let mut dp = vec![vec![0usize; n + 1]; m + 1];

    for i in 0..=m {
        dp[i][0] = i;
    }
    for j in 0..=n {
        dp[0][j] = j;
    }

    for i in 1..=m {
        for j in 1..=n {
            let cost = if a_chars[i - 1].to_lowercase().next() == b_chars[j - 1].to_lowercase().next() {
                0
            } else {
                1
            };
            dp[i][j] = (dp[i - 1][j] + 1)
                .min(dp[i][j - 1] + 1)
                .min(dp[i - 1][j - 1] + cost);
        }
    }

    dp[m][n]
}

/// Known standard categories in AppDepot.
pub const CANONICAL_CATEGORIES: &[&str] = &[
    "ide", "sdk", "browsers", "databases", "runtimes", "network", "office", "tools", "games", "media",
];

/// Corrects a user-supplied category string if a human typo was made.
/// E.g., "ides" -> "ide", "browser" -> "browsers", "db" -> "databases", "runtime" -> "runtimes".
pub fn correct_category_typo(input: &str) -> Result<String, String> {
    let clean = input.trim().to_lowercase();
    if clean.is_empty() {
        return Err("Category cannot be empty. Choose from: ide, sdk, browsers, databases, runtimes, network, office, tools.".to_string());
    }

    // Direct match
    if CANONICAL_CATEGORIES.contains(&clean.as_str()) {
        return Ok(clean);
    }

    // Common abbreviations and aliases
    match clean.as_str() {
        "ides" | "editor" | "editors" => return Ok("ide".to_string()),
        "sdks" | "toolchain" | "toolchains" => return Ok("sdk".to_string()),
        "browser" | "web" => return Ok("browsers".to_string()),
        "db" | "dbs" | "database" | "sql" => return Ok("databases".to_string()),
        "runtime" | "lang" | "languages" => return Ok("runtimes".to_string()),
        "net" | "vpn" | "networking" => return Ok("network".to_string()),
        "doc" | "docs" | "productivity" => return Ok("office".to_string()),
        "tool" | "util" | "utils" | "utilities" => return Ok("tools".to_string()),
        "game" | "gaming" => return Ok("games".to_string()),
        _ => {}
    }

    // Find closest match via Levenshtein distance
    let mut closest: Option<(&str, usize)> = None;
    for &cat in CANONICAL_CATEGORIES {
        let dist = levenshtein_distance(&clean, cat);
        if dist <= 2 {
            if let Some((_, best_dist)) = closest {
                if dist < best_dist {
                    closest = Some((cat, dist));
                }
            } else {
                closest = Some((cat, dist));
            }
        }
    }

    if let Some((best_cat, _)) = closest {
        return Ok(best_cat.to_string());
    }

    Err(format!(
        "Unknown category '{}'. Valid categories are: {}",
        input,
        CANONICAL_CATEGORIES.join(", ")
    ))
}

/// Finds the closest matching candidate from a list of strings.
/// Useful for "Did you mean 'antigravity'?" when user typed 'antigrvity'.
pub fn suggest_closest<'a>(input: &str, candidates: &'a [String]) -> Option<&'a str> {
    let lower = input.to_lowercase();
    let mut best_match: Option<(&'a str, usize)> = None;

    for cand in candidates {
        let cand_lower = cand.to_lowercase();
        // Exact prefix or contains
        if cand_lower.contains(&lower) || lower.contains(&cand_lower) {
            return Some(cand.as_str());
        }

        let dist = levenshtein_distance(&lower, &cand_lower);
        // Allow up to 3 character edits or 35% of length
        let max_dist = (lower.len() / 3).max(2).min(4);
        if dist <= max_dist {
            if let Some((_, current_best)) = best_match {
                if dist < current_best {
                    best_match = Some((cand.as_str(), dist));
                }
            } else {
                best_match = Some((cand.as_str(), dist));
            }
        }
    }

    best_match.map(|(s, _)| s)
}

/// If a user types a path that does not exist, looks in the same directory
/// or in ~/Downloads for a file that matches case-insensitively or with minor typos.
pub fn fuzzy_find_source_file(input_path: &Path) -> Option<PathBuf> {
    if input_path.exists() {
        return Some(input_path.to_path_buf());
    }

    // Try parent directory of input_path
    let target_name = input_path.file_name()?.to_string_lossy().to_lowercase();
    let search_dirs = vec![
        input_path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from(".")),
        PathBuf::from("."),
        dirs_home_downloads(),
    ];

    for dir in search_dirs {
        if !dir.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if let Some(fname) = p.file_name().and_then(|f| f.to_str()) {
                    let fname_lower = fname.to_lowercase();
                    // Exact case-insensitive match or contains
                    if fname_lower == target_name || fname_lower.contains(&target_name) || target_name.contains(&fname_lower) {
                        return Some(p);
                    }
                    // Levenshtein close match
                    if levenshtein_distance(&fname_lower, &target_name) <= 2 {
                        return Some(p);
                    }
                }
            }
        }
    }

    None
}

fn dirs_home_downloads() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join("Downloads")
    } else {
        PathBuf::from("/tmp")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_levenshtein() {
        assert_eq!(levenshtein_distance("kitten", "sitting"), 3);
        assert_eq!(levenshtein_distance("ide", "ides"), 1);
        assert_eq!(levenshtein_distance("antigravity", "antigrvity"), 1);
        assert_eq!(levenshtein_distance("chrome", "chrome"), 0);
    }

    #[test]
    fn test_correct_category_typo() {
        assert_eq!(correct_category_typo("ides").unwrap(), "ide");
        assert_eq!(correct_category_typo("browser").unwrap(), "browsers");
        assert_eq!(correct_category_typo("db").unwrap(), "databases");
        assert_eq!(correct_category_typo("databse").unwrap(), "databases");
        assert_eq!(correct_category_typo("tool").unwrap(), "tools");
        assert_eq!(correct_category_typo("runtime").unwrap(), "runtimes");
        assert!(correct_category_typo("totally_invalid_xyz").is_err());
    }

    #[test]
    fn test_suggest_closest() {
        let candidates = vec![
            "antigravity".to_string(),
            "chrome".to_string(),
            "flutter".to_string(),
            "mysql".to_string(),
        ];
        assert_eq!(suggest_closest("antigrvity", &candidates), Some("antigravity"));
        assert_eq!(suggest_closest("fluttr", &candidates), Some("flutter"));
        assert_eq!(suggest_closest("chome", &candidates), Some("chrome"));
        assert_eq!(suggest_closest("unknownxyz", &candidates), None);
    }
}
