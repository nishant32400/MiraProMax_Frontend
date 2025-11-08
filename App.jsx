import React, { useState, useEffect, useRef } from "react";
import EventStreamViewer from "./components/EventStreamViewer";

const AG_AGENT_ENDPOINT = import.meta.env.VITE_AGENT_ENDPOINT || "http://localhost:8001/agent";

export default function App() {
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState([]);
  const esRef = useRef(null);

  function pushEvent(e) {
    setEvents(prev => [...prev, e]);
  }

  async function startRun() {
    if (!query.trim()) return alert("Enter a question");
    setEvents([]);

    // Build minimal RunAgentInput shape
    const body = {
      thread_id: "thread-" + Date.now(),
      run_id: "run-" + Date.now(),
      messages: [{ role: "user", content: query }],
      tools: []
    };

    // Use Fetch to POST and then listen to SSE via EventSource? (EventSource can't directly open responses to POST)
    // Instead we use /agent POST and read streaming response with fetch + reader (SSE parsing manually).
    const resp = await fetch(AG_AGENT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const txt = await resp.text();
      alert("Agent error: " + txt);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE sections are separated by double-newline. Each event line starts with "data: "
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 2);
        // parse lines (there may be multiple lines starting with data:)
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            try {
              const obj = JSON.parse(payload);
              pushEvent(obj);
            } catch (err) {
              pushEvent({ type: "RAW", raw: payload });
            }
          }
        }
      }
    }
  }

  return (
    <div style={{ padding: 18, fontFamily: "Inter, sans-serif" }}>
      <h1>✈️ FlightOps — AG-UI Client</h1>
      <p>Ask flight-ops questions. This client posts a run and renders AG-UI events.</p>

      <textarea
        rows={4}
        style={{ width: "100%", fontSize: 16 }}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Why was flight 6E215 delayed on June 23, 2024?"
      />
      <div style={{ marginTop: 8 }}>
        <button onClick={startRun}>Ask</button>
      </div>

      <hr />

      <EventStreamViewer events={events} />
    </div>
  );
}
