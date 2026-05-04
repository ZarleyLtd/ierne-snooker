// Custom scripts for Ierne Snooker League
// Each script is wrapped in a check for its target container to ensure it only runs on the appropriate page

document.addEventListener('DOMContentLoaded', function () {

  // ============================================
  // INDEX PAGE - Knockout Tournament Display
  // ============================================
  // Checks for knockout block containers (champ-semis, champ-final, plate-qf, plate-sf, plate-final)
  if (document.getElementById('champ-semis') || document.getElementById('champ-final') || 
      document.getElementById('plate-qf') || document.getElementById('plate-sf') || 
      document.getElementById('plate-final')) {
    
    const fixturesSheetUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vSE9aMT0c6AQ-wBzuXwYm5iQoAkwJLi0kaPuL3BfoJNT2dJXvr9r8WY_b4eJqDmAy5e4nnDgHbhpE4z/pub?gid=2003970244&single=true&output=csv";

    /* =========================== */
    /*     LOAD KNOCKOUT DATA      */
    /* =========================== */
    Papa.parse(fixturesSheetUrl, {
      download: true,
      header: true,
      complete: function (results) {

        const fixtures = results.data;
        const gw = r => (r["Game Week"] || "").trim().toUpperCase();

        renderKnockout("champ-semis", fixtures.filter(r => gw(r)==="CS"));
        renderKnockout("champ-final", fixtures.filter(r => gw(r)==="CF"));

        renderKnockout("plate-qf", fixtures.filter(r => gw(r)==="PQ"));
        renderKnockout("plate-sf", fixtures.filter(r => gw(r)==="PS"));
        renderKnockout("plate-final", fixtures.filter(r => gw(r)==="PF"));
      }
    });


    /* =========================== */
    /*   RENDER KNOCKOUT BLOCKS    */
    /* =========================== */
    function renderKnockout(id, matches) {
      const container = document.getElementById(id);
      if (!container) return;

      container.innerHTML = "";

      if (!matches || matches.length === 0) {
        container.textContent = "(No fixtures yet)";
        return;
      }

      matches.forEach(m => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "center";
        row.style.alignItems = "center";
        row.style.margin = "0.35em 0";
        row.style.fontSize = "1.05em";
        row.style.whiteSpace = "nowrap";

        // FIXED WIDTHS (adjust if needed)
        const NAME_WIDTH = "9.5em";    // More width = more characters allowed

        // ---- Player A ----
        const playerA = document.createElement("span");
        playerA.textContent = m["Player A"] || "";
        playerA.style.display = "inline-block";
        playerA.style.width = NAME_WIDTH;
        playerA.style.textAlign = "right";
        playerA.style.paddingRight = "0.3em";

        // ---- V or score ----
        let centerText = "V";
        if (m["Result"] && m["Result"].trim() !== "") {
          centerText = `[${m["Result"]}]`;
        }

        const middle = document.createElement("span");
        middle.textContent = centerText;
        middle.style.display = "inline-block";
        middle.style.width = "3em";   // keeps the center stable
        middle.style.textAlign = "center";
        middle.style.fontWeight = "bold";

        // ---- Player B ----
        const playerB = document.createElement("span");
        playerB.textContent = m["Player B"] || "";
        playerB.style.display = "inline-block";
        playerB.style.width = NAME_WIDTH;
        playerB.style.textAlign = "left";
        playerB.style.paddingLeft = "0.3em";

        // Assemble the row
        row.appendChild(playerA);
        row.appendChild(middle);
        row.appendChild(playerB);
        container.appendChild(row);
      });
    }
  }


  // ============================================
  // FIXTURES PAGE - Upcoming Fixtures List
  // ============================================
  if (document.getElementById('fixtures-list')) {
    const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSE9aMT0c6AQ-wBzuXwYm5iQoAkwJLi0kaPuL3BfoJNT2dJXvr9r8WY_b4eJqDmAy5e4nnDgHbhpE4z/pub?gid=2003970244&single=true&output=csv";

    Papa.parse(sheetUrl, {
      download: true,
      header: true,
      complete: function(results) {

        const container = document.querySelector("#fixtures-list");
        container.innerHTML = "";

        // Only show upcoming fixtures (Result empty)
        const rows = results.data.filter(r =>
          r['Game Week'] && r['Player A'] && r['Player B'] &&
          (!r['Result'] || r['Result'].trim() === "")
        );

        if (rows.length === 0) {
          container.innerHTML = "<p><em>No upcoming fixtures found.</em></p>";
          return;
        }

        // Group fixtures in the SAME ORDER as in the sheet
        const grouped = {};
        const orderedWeeks = [];

        rows.forEach(r => {
          const week = r['Game Week'].trim();

          if (!grouped[week]) {
            grouped[week] = [];
            orderedWeeks.push(week);   // preserve original order
          }
          grouped[week].push(r);
        });

        // Mapping knockout codes → labels
        const KO_LABELS = {
          "CS": "Championship Semis",
          "CF": "Championship Final",
          "PQ": "Plate Quarters",
          "PS": "Plate Semis",
          "PF": "Plate Final"
        };

        orderedWeeks.forEach(week => {

          const h3 = document.createElement("h3");
          const num = parseInt(week);

          if (!isNaN(num)) {
            h3.textContent = `Game Week ${week}`;
          } else {
            h3.textContent = KO_LABELS[week] || week;
          }

          h3.style.marginTop = "1.5em";
          h3.style.marginBottom = "0.5em";
          h3.style.fontWeight = "bold";
          h3.style.textAlign = "center";
          container.appendChild(h3);

          // Render each match in order
          grouped[week].forEach(match => {
            const div = document.createElement("div");
            div.style.display = "flex";
            div.style.justifyContent = "center";
            div.style.alignItems = "center";
            div.style.gap = "1em";
            div.style.margin = "0.3em 0";
            div.style.fontSize = "1.05em";

            const playerA = document.createElement("span");
            playerA.textContent = match['Player A'];
            playerA.style.flex = "1";
            playerA.style.textAlign = "right";

            const vs = document.createElement("span");
            vs.textContent = "V";
            vs.style.flex = "0 0 auto";
            vs.style.fontWeight = "bold";
            vs.style.minWidth = "1.5em";
            vs.style.textAlign = "center";

            const playerB = document.createElement("span");
            playerB.textContent = match['Player B'];
            playerB.style.flex = "1";
            playerB.style.textAlign = "left";

            div.appendChild(playerA);
            div.appendChild(vs);
            div.appendChild(playerB);
            container.appendChild(div);
          });
        });
      },

      error: function(err) {
        console.error("Error loading CSV:", err);
      }
    });
  }


  // ============================================
  // HANDICAPS PAGE - Handicaps Table
  // ============================================
  if (document.getElementById('handicaps')) {
    const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSE9aMT0c6AQ-wBzuXwYm5iQoAkwJLi0kaPuL3BfoJNT2dJXvr9r8WY_b4eJqDmAy5e4nnDgHbhpE4z/pub?gid=0&single=true&output=csv";

    Papa.parse(sheetUrl, {
      download: true,
      header: true,
      complete: function(results) {
        const table = document.querySelector("#handicaps");
        let tbody = table.querySelector("tbody");
        if (!tbody) {
          tbody = document.createElement("tbody");
          table.appendChild(tbody);
        }
        tbody.innerHTML = "";

        const rows = results.data.filter(r => r['Player Name'] && r['Handicap'] && r['Handicap Date']);

        const latestByPlayer = {};
        rows.forEach(r => {
          const name = r['Player Name'].trim();
          const date = new Date(r['Handicap Date']);
          if (!latestByPlayer[name] || date > new Date(latestByPlayer[name]['Handicap Date'])) {
            latestByPlayer[name] = r;
          }
        });

        const sortedPlayers = Object.values(latestByPlayer).sort((a, b) =>
          a['Player Name'].localeCompare(b['Player Name'])
        );

        sortedPlayers.forEach(r => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${r['Player Name']}</td>
            <td>${r['Handicap']}</td>
          `;
          tbody.appendChild(tr);
        });
      },
      error: function(err) {
        console.error("Error loading CSV:", err);
      }
    });
  }


  // ============================================
  // LEAGUES PAGE - League Standings
  // ============================================
  if (document.getElementById('league-one') || document.getElementById('league-two')) {
    const leagueSheetUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vSE9aMT0c6AQ-wBzuXwYm5iQoAkwJLi0kaPuL3BfoJNT2dJXvr9r8WY_b4eJqDmAy5e4nnDgHbhpE4z/pub?gid=902750162&single=true&output=csv";


    /* =========================== */
    /*   LOAD LEAGUE STANDINGS     */
    /* =========================== */
    Papa.parse(leagueSheetUrl, {
      download: true,
      skipEmptyLines: true,
      complete: function(results) {

        const rows = results.data.slice(3);
        const leagueOne = [];
        const leagueTwo = [];

        rows.forEach(row => {
          if (row[0] && row[0].trim()) {
            leagueOne.push({
              'Player Name': row[0].trim(),
              P: row[1], W: row[2], L: row[3], '+/-': row[4], Pts: row[5]
            });
          }
          if (row[7] && row[7].trim()) {
            leagueTwo.push({
              'Player Name': row[7].trim(),
              P: row[8], W: row[9], L: row[10], '+/-': row[11], Pts: row[12]
            });
          }
        });

        const toInt = v => (isNaN(parseInt(v)) ? -Infinity : parseInt(v));

        const sortFn = (a, b) =>
          (toInt(b.Pts) - toInt(a.Pts)) ||
          (toInt(b['+/-']) - toInt(a['+/-'])) ||
          a['Player Name'].localeCompare(b['Player Name']);

        leagueOne.sort(sortFn);
        leagueTwo.sort(sortFn);

        // formatting helpers
        const SS = v => (v == null ? '' : String(v).trim());
        const L = (v, w) => SS(v).padStart(w);
        const R = (v, w) => SS(v).padEnd(w);
        const truncate = n => (SS(n).length > 16 ? SS(n).slice(0, 14) + '..' : SS(n));

        function writeLeague(id, league) {
          const el = document.getElementById(id);
          if (!el) return;

          const header = [
            L('#', 2), R('Player Name', 16),
            L('P',2), L('W',2), L('L',2), L('+/-',3), L('Pts',3)
          ].join(' ');

          const sep = '-'.repeat(header.length);

          const lines = [header, sep];

          let lastPts=null, lastPM=null, lastRank=0;

          league.forEach((p, i) => {
            const pts = toInt(p.Pts);
            const pm  = toInt(p['+/-']);

            let rank = (pts === lastPts && pm === lastPM) ? lastRank : (i+1);

            lastPts = pts;
            lastPM  = pm;
            lastRank = rank;

            lines.push([
              L(rank,2),
              R(truncate(p['Player Name']),16),
              L(p.P,2), L(p.W,2), L(p.L,2),
              L(p['+/-'],3), L(p.Pts,3)
            ].join(' '));
          });

          el.textContent = lines.join("\n");
        }

        writeLeague('league-one', leagueOne);
        writeLeague('league-two', leagueTwo);
      }
    });
  }


  // ============================================
  // RESULTS PAGE - Results List
  // ============================================
  if (document.getElementById('results-list')) {
    const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSE9aMT0c6AQ-wBzuXwYm5iQoAkwJLi0kaPuL3BfoJNT2dJXvr9r8WY_b4eJqDmAy5e4nnDgHbhpE4z/pub?gid=2003970244&single=true&output=csv";

    Papa.parse(sheetUrl, {
      download: true,
      header: true,
      complete: function(results) {
        const container = document.querySelector("#results-list");
        container.innerHTML = "";

        // Only include rows where results exist
        const rows = results.data.filter(r =>
          r['Game Week'] && r['Player A'] && r['Player B'] &&
          r['Result'] && r['Result'].trim() !== ""
        );

        if (rows.length === 0) {
          container.innerHTML = "<p><em>No results available yet.</em></p>";
          return;
        }

        // Group in the same order as they appear in the sheet
        const grouped = {};
        const orderedWeeks = [];

        rows.forEach(r => {
          const week = r['Game Week'].trim();

          if (!grouped[week]) {
            grouped[week] = [];
            orderedWeeks.push(week);
          }

          grouped[week].push(r);
        });

        // Knockout labels
        const KO_LABELS = {
          "CS": "Championship Semis",
          "CF": "Championship Final",
          "PQ": "Plate Quarters",
          "PS": "Plate Semis",
          "PF": "Plate Final"
        };

        // Render each group in sheet order
        orderedWeeks.forEach(week => {
          const h3 = document.createElement("h3");
          const num = parseInt(week);

          if (!isNaN(num)) {
            h3.textContent = `Game Week ${week}`;
          } else {
            h3.textContent = KO_LABELS[week] || week;
          }

          h3.style.marginTop = "1.5em";
          h3.style.marginBottom = "0.5em";
          h3.style.fontWeight = "bold";
          h3.style.textAlign = "center";
          container.appendChild(h3);

          // Render each result in order
          grouped[week].forEach(match => {
            const div = document.createElement("div");
            div.style.display = "flex";
            div.style.justifyContent = "center";
            div.style.alignItems = "center";
            div.style.gap = "0.5em";
            div.style.margin = "0.3em 0";
            div.style.fontSize = "1.05em";

            const [aScore, bScore] = match['Result'].split('-').map(s => parseInt(s.trim(), 10));

            const playerA = document.createElement("span");
            playerA.textContent = match['Player A'];
            playerA.style.flex = "1";
            playerA.style.textAlign = "right";
            if (aScore > bScore) playerA.style.fontWeight = "bold";

            const result = document.createElement("span");
            result.textContent = `[${match['Result']}]`;
            result.style.flex = "0 0 auto";
            result.style.fontWeight = "bold";
            result.style.minWidth = "3.5em";
            result.style.textAlign = "center";

            const playerB = document.createElement("span");
            playerB.textContent = match['Player B'];
            playerB.style.flex = "1";
            playerB.style.textAlign = "left";
            if (bScore > aScore) playerB.style.fontWeight = "bold";

            div.appendChild(playerA);
            div.appendChild(result);
            div.appendChild(playerB);
            container.appendChild(div);
          });
        });
      },

      error: function(err) {
        console.error("Error loading CSV:", err);
      }
    });
  }


  // ============================================
  // OLD FRONT PAGE - League Leaders
  // ============================================
  // Checks if the page contains [aleader] or [bleader] placeholders
  if (document.body.innerHTML.includes('[aleader]') || document.body.innerHTML.includes('[bleader]')) {
    const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSE9aMT0c6AQ-wBzuXwYm5iQoAkwJLi0kaPuL3BfoJNT2dJXvr9r8WY_b4eJqDmAy5e4nnDgHbhpE4z/pub?gid=902750162&single=true&output=csv";

    Papa.parse(sheetUrl, {
      download: true,
      skipEmptyLines: true,
      complete: function(results) {
        const dataRows = results.data.slice(3); // skip header rows
        const leagueA = [];
        const leagueB = [];

        dataRows.forEach(row => {
          if (row[0] && row[0].trim()) {
            leagueA.push({
              name: row[0].trim(),
              Pts: parseInt(row[5]) || 0,
              pm: parseInt(row[4]) || 0
            });
          }
          if (row[7] && row[7].trim()) {
            leagueB.push({
              name: row[7].trim(),
              Pts: parseInt(row[12]) || 0,
              pm: parseInt(row[11]) || 0
            });
          }
        });

        const sortFn = (a, b) => (b.Pts - a.Pts) || (b.pm - a.pm);
        leagueA.sort(sortFn);
        leagueB.sort(sortFn);

        function getTopPlayers(league) {
          if (league.length === 0) return "N/A";

          const topPoints = league[0].Pts;
          const topPM = league[0].pm;

          // Get all players tied at the top
          const topPlayers = league.filter(p => p.Pts === topPoints && p.pm === topPM)
            .map(p => p.name);

          if (topPlayers.length === 1) {
            return topPlayers[0];
          } else {
            return topPlayers.join(' & ') + " (tied)";
          }
        }

        const aLeader = getTopPlayers(leagueA);
        const bLeader = getTopPlayers(leagueB);

        document.querySelectorAll('p, h3, div, span').forEach(el => {
          el.innerHTML = el.innerHTML
            .replace(/\[aleader\]/g, aLeader)
            .replace(/\[bleader\]/g, bLeader);
        });
      },
      error: function(err) {
        console.error("Error loading CSV:", err);
      }
    });
  }


  // ============================================
  // OLD LEAGUES PAGE - Combined Knockout and League Standings
  // ============================================
  // This page has both knockout blocks and league standings
  if ((document.getElementById('champ-semis') || document.getElementById('champ-final') || 
       document.getElementById('plate-qf') || document.getElementById('plate-sf') || 
       document.getElementById('plate-final')) && 
      (document.getElementById('league-one') || document.getElementById('league-two'))) {
    
    const leagueSheetUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vSE9aMT0c6AQ-wBzuXwYm5iQoAkwJLi0kaPuL3BfoJNT2dJXvr9r8WY_b4eJqDmAy5e4nnDgHbhpE4z/pub?gid=902750162&single=true&output=csv";

    const fixturesSheetUrl =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vSE9aMT0c6AQ-wBzuXwYm5iQoAkwJLi0kaPuL3BfoJNT2dJXvr9r8WY_b4eJqDmAy5e4nnDgHbhpE4z/pub?gid=2003970244&single=true&output=csv";


    /* =========================== */
    /*   LOAD LEAGUE STANDINGS     */
    /* =========================== */
    Papa.parse(leagueSheetUrl, {
      download: true,
      skipEmptyLines: true,
      complete: function(results) {

        const rows = results.data.slice(3);
        const leagueOne = [];
        const leagueTwo = [];

        rows.forEach(row => {
          if (row[0] && row[0].trim()) {
            leagueOne.push({
              'Player Name': row[0].trim(),
              P: row[1], W: row[2], L: row[3], '+/-': row[4], Pts: row[5]
            });
          }
          if (row[7] && row[7].trim()) {
            leagueTwo.push({
              'Player Name': row[7].trim(),
              P: row[8], W: row[9], L: row[10], '+/-': row[11], Pts: row[12]
            });
          }
        });

        const toInt = v => (isNaN(parseInt(v)) ? -Infinity : parseInt(v));

        const sortFn = (a, b) =>
          (toInt(b.Pts) - toInt(a.Pts)) ||
          (toInt(b['+/-']) - toInt(a['+/-'])) ||
          a['Player Name'].localeCompare(b['Player Name']);

        leagueOne.sort(sortFn);
        leagueTwo.sort(sortFn);

        // formatting helpers
        const SS = v => (v == null ? '' : String(v).trim());
        const L = (v, w) => SS(v).padStart(w);
        const R = (v, w) => SS(v).padEnd(w);
        const truncate = n => (SS(n).length > 16 ? SS(n).slice(0, 14) + '..' : SS(n));

        function writeLeague(id, league) {
          const el = document.getElementById(id);
          if (!el) return;

          const header = [
            L('#', 2), R('Player Name', 16),
            L('P',2), L('W',2), L('L',2), L('+/-',3), L('Pts',3)
          ].join(' ');

          const sep = '-'.repeat(header.length);

          const lines = [header, sep];

          let lastPts=null, lastPM=null, lastRank=0;

          league.forEach((p, i) => {
            const pts = toInt(p.Pts);
            const pm  = toInt(p['+/-']);

            let rank = (pts === lastPts && pm === lastPM) ? lastRank : (i+1);

            lastPts = pts;
            lastPM  = pm;
            lastRank = rank;

            lines.push([
              L(rank,2),
              R(truncate(p['Player Name']),16),
              L(p.P,2), L(p.W,2), L(p.L,2),
              L(p['+/-'],3), L(p.Pts,3)
            ].join(' '));
          });

          el.textContent = lines.join("\n");
        }

        writeLeague('league-one', leagueOne);
        writeLeague('league-two', leagueTwo);
      }
    });


    /* =========================== */
    /*     LOAD KNOCKOUT DATA      */
    /* =========================== */
    Papa.parse(fixturesSheetUrl, {
      download: true,
      header: true,
      complete: function (results) {

        const fixtures = results.data;
        const gw = r => (r["Game Week"] || "").trim().toUpperCase();

        renderKnockout("champ-semis", fixtures.filter(r => gw(r)==="CS"));
        renderKnockout("champ-final", fixtures.filter(r => gw(r)==="CF"));

        renderKnockout("plate-qf", fixtures.filter(r => gw(r)==="PQ"));
        renderKnockout("plate-sf", fixtures.filter(r => gw(r)==="PS"));
        renderKnockout("plate-final", fixtures.filter(r => gw(r)==="PF"));
      }
    });


    /* =========================== */
    /*   RENDER KNOCKOUT BLOCKS    */
    /* =========================== */
    function renderKnockout(id, matches) {
      const container = document.getElementById(id);
      if (!container) return;

      container.innerHTML = "";

      if (!matches || matches.length === 0) {
        container.textContent = "(No fixtures yet)";
        return;
      }

      matches.forEach(m => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "center";
        row.style.alignItems = "center";
        row.style.margin = "0.35em 0";
        row.style.fontSize = "1.05em";
        row.style.whiteSpace = "nowrap";

        // FIXED WIDTHS (adjust if needed)
        const NAME_WIDTH = "9.5em";    // More width = more characters allowed

        // ---- Player A ----
        const playerA = document.createElement("span");
        playerA.textContent = m["Player A"] || "";
        playerA.style.display = "inline-block";
        playerA.style.width = NAME_WIDTH;
        playerA.style.textAlign = "right";
        playerA.style.paddingRight = "0.3em";

        // ---- V or score ----
        let centerText = "V";
        if (m["Result"] && m["Result"].trim() !== "") {
          centerText = `[${m["Result"]}]`;
        }

        const middle = document.createElement("span");
        middle.textContent = centerText;
        middle.style.display = "inline-block";
        middle.style.width = "3em";   // keeps the center stable
        middle.style.textAlign = "center";
        middle.style.fontWeight = "bold";

        // ---- Player B ----
        const playerB = document.createElement("span");
        playerB.textContent = m["Player B"] || "";
        playerB.style.display = "inline-block";
        playerB.style.width = NAME_WIDTH;
        playerB.style.textAlign = "left";
        playerB.style.paddingLeft = "0.3em";

        // Assemble the row
        row.appendChild(playerA);
        row.appendChild(middle);
        row.appendChild(playerB);
        container.appendChild(row);
      });
    }
  }


  // ============================================
  // UNDER DEVELOPMENT PAGE - League Standings (Alternative IDs)
  // ============================================
  if (document.getElementById('league-a') || document.getElementById('league-b')) {
    const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSE9aMT0c6AQ-wBzuXwYm5iQoAkwJLi0kaPuL3BfoJNT2dJXvr9r8WY_b4eJqDmAy5e4nnDgHbhpE4z/pub?gid=902750162&single=true&output=csv";

    Papa.parse(sheetUrl, {
      download: true,
      skipEmptyLines: true,
      complete: function(results) {
        const dataRows = results.data.slice(3);
        const leagueA = [];
        const leagueB = [];

        dataRows.forEach(row => {
          if (row[0] && row[0].trim()) {
            leagueA.push({ 'Player Name': row[0].trim(), P: row[1]||'', W: row[2]||'', L: row[3]||'', '+/-': row[4]||'', Pts: row[5]||'' });
          }
          if (row[7] && row[7].trim()) {
            leagueB.push({ 'Player Name': row[7].trim(), P: row[8]||'', W: row[9]||'', L: row[10]||'', '+/-': row[11]||'', Pts: row[12]||'' });
          }
        });

        const toInt = v => { const n = parseInt(v, 10); return isNaN(n) ? -Infinity : n; };
        const sortFn = (a, b) => (toInt(b.Pts) - toInt(a.Pts)) || (toInt(b['+/-']) - toInt(a['+/-']));

        leagueA.sort(sortFn);
        leagueB.sort(sortFn);

        function StringSafe(v) { return (v===undefined||v===null)?'':String(v).trim(); }
        function padRight(str, width) { str=StringSafe(str); return str.length>=width?str:str+" ".repeat(width-str.length); }
        function padLeft(str, width) { str=StringSafe(str); return str.length>=width?str:" ".repeat(width-str.length)+str; }

        // truncate names > 14 chars
        function truncateName(name) {
          name = StringSafe(name);
          return (name.length>16)?name.slice(0,14)+'..':name;
        }

        function buildText(containerId, league) {
          const container = document.getElementById(containerId);
          if (!container) return;
          if (league.length === 0) { container.textContent="No players."; return; }

          const rankWidth = 2;
          const nameWidth = 16; // fixed width
          const pWidth=2, wWidth=2, lWidth=2, pmWidth=3, ptsWidth=3;

          const header = [padLeft('#', rankWidth), padRight('Player Name', nameWidth), padLeft('P',pWidth),
                          padLeft('W',wWidth), padLeft('L',lWidth), padLeft('+/-',pmWidth), padLeft('Pts',ptsWidth)].join(' ');
          const sep = '-'.repeat(header.length);
          const lines = [header, sep];

          let lastPts = null, lastPM = null, lastRank = 0;

          league.forEach((p, idx) => {
            const pts = toInt(p.Pts);
            const pm = toInt(p['+/-']);
            let rank;
            if (pts === lastPts && pm === lastPM) {
              rank = lastRank; // same rank as previous
            } else {
              rank = idx + 1;
              lastRank = rank;
              lastPts = pts;
              lastPM = pm;
            }

            const row = [
              padLeft(rank, rankWidth),
              padRight(truncateName(p['Player Name']), nameWidth),
              padLeft(p.P,pWidth),
              padLeft(p.W,wWidth),
              padLeft(p.L,lWidth),
              padLeft(p['+/-'],pmWidth),
              padLeft(p.Pts,ptsWidth)
            ].join(' ');

            lines.push(row);
          });

          container.textContent = lines.join("\n");
        }

        buildText('league-a', leagueA);
        buildText('league-b', leagueB);
      }
    });
  }

  // ============================================
  // IMAGE LOADING - Add loaded class to images
  // ============================================
  var images = document.querySelectorAll("img[loading]");
  for (var i = 0; i < images.length; i++) {
    if (images[i].complete) {
      images[i].classList.add("is-loaded");
    } else {
      images[i].addEventListener(
        "load",
        function () {
          this.classList.add("is-loaded");
        },
        false
      );
    }
  }

});

