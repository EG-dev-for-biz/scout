import React, { useState, useRef, useEffect } from "react";
import { css } from "@emotion/react";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { keyframes } from "@emotion/react";
import { geocode, geocodeToAreaTuple, GeocodeResult } from "@/utils/geocoding";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

interface LocationSearchProps {
  onPick: (areaTuple: { lat: number; lng: number }[], result: GeocodeResult) => void;
}

export function LocationSearch({ onPick }: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    if (!query.trim() || query.trim().length < 3) {
      setResults([]);
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      geocode(query)
        .then((rs) => {
          setResults(rs);
          setOpen(rs.length > 0);
        })
        .catch((err) => {
          setError(String(err.message || err));
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 350) as unknown as number;

    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handlePick = (r: GeocodeResult) => {
    onPick(geocodeToAreaTuple(r), r);
    setOpen(false);
    setQuery(r.formattedAddress);
  };

  const clear = () => {
    setQuery("");
    setResults([]);
    setError(null);
    setOpen(false);
  };

  return (
    <div ref={containerRef} css={css({ position: "relative", width: "100%" })}>
      <div
        css={css({
          position: "relative",
          display: "flex",
          alignItems: "center",
        })}
      >
        <Search
          size={12}
          css={css({
            position: "absolute",
            left: "10px",
            color: "#6b6b78",
            pointerEvents: "none",
          })}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search a place — e.g. Times Square"
          css={css({
            width: "100%",
            backgroundColor: "#0f0f11",
            border: "1px solid #2a2a2e",
            borderRadius: "6px",
            padding: "6px 28px 6px 28px",
            color: "#e8e8ec",
            fontSize: "12px",
            outline: "none",
            transition: "border-color 0.15s",
            ":focus": { borderColor: "#3b82f6" },
            "::placeholder": { color: "#4a4a54" },
          })}
        />
        {loading && (
          <Loader2
            size={12}
            css={css({
              position: "absolute",
              right: "10px",
              color: "#3b82f6",
              animation: `${spin} 1s linear infinite`,
            })}
          />
        )}
        {!loading && query.length > 0 && (
          <button
            onClick={clear}
            css={css({
              position: "absolute",
              right: "8px",
              background: "none",
              border: "none",
              padding: "2px",
              cursor: "pointer",
              color: "#6b6b78",
              display: "flex",
              ":hover": { color: "#e8e8ec" },
            })}
          >
            <X size={11} />
          </button>
        )}
      </div>

      {error && (
        <div
          css={css({
            marginTop: "4px",
            fontSize: "10px",
            color: "#ef4444",
          })}
        >
          {error}
        </div>
      )}

      {open && results.length > 0 && (
        <div
          css={css({
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            backgroundColor: "#17171a",
            border: "1px solid #2a2a2e",
            borderRadius: "6px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
            zIndex: 100,
            overflow: "hidden",
          })}
        >
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => handlePick(r)}
              css={css({
                width: "100%",
                background: "none",
                border: "none",
                padding: "8px 10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                textAlign: "left",
                borderBottom: i < results.length - 1 ? "1px solid #1e1e22" : "none",
                ":hover": { backgroundColor: "#1e1e22" },
              })}
            >
              <MapPin size={11} color="#3b82f6" style={{ marginTop: "3px", flexShrink: 0 }} />
              <div css={css({ flex: 1, minWidth: 0 })}>
                <div
                  css={css({
                    fontSize: "11px",
                    fontWeight: "500",
                    color: "#e8e8ec",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: "1.3",
                  })}
                >
                  {r.formattedAddress}
                </div>
                {r.types.length > 0 && (
                  <div
                    css={css({
                      fontSize: "9px",
                      color: "#6b6b78",
                      marginTop: "2px",
                    })}
                  >
                    {r.types.slice(0, 3).join(" · ").replace(/_/g, " ")}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
