export function highlightSearchQuery(
  paragraphElement: HTMLElement,
  query: string,
  highlightClass: string = "search-highlight",
): void {
  if (!paragraphElement || !query) {
    return;
  }

  // Use a case-insensitive search for better UX
  const lowerCaseQuery = query.toLowerCase();

  // Step 1 & 2: Collect all Text nodes and their content, along with their original offsets
  const textNodes: { node: Text; startOffset: number; endOffset: number }[] = [];
  let currentOffset = 0;

  function collectTextNodes(node: Node) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent !== null) {
      textNodes.push({
        node: node as Text,
        startOffset: currentOffset,
        endOffset: currentOffset + node.textContent.length,
      });
      currentOffset += node.textContent.length;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Recursively traverse child nodes, but skip script and style tags
      if ((node as HTMLElement).tagName !== "SCRIPT" && (node as HTMLElement).tagName !== "STYLE") {
        node.childNodes.forEach(collectTextNodes);
      }
    }
  }

  // Start collection from the paragraph element
  collectTextNodes(paragraphElement);

  // Step 3: Create a plain text version for searching
  const fullText = textNodes.map((tn) => tn.node.textContent).join("");
  const lowerCaseFullText = fullText.toLowerCase();

  // Step 4: Find all occurrences of the query in the plain text
  let startIndex = 0;
  const match: { start: number; end: number }[] = [];

  while (startIndex < lowerCaseFullText.length) {
    const foundIndex = lowerCaseFullText.indexOf(lowerCaseQuery, startIndex);
    if (foundIndex === -1) {
      break;
    }
    match.push({ start: foundIndex, end: foundIndex + lowerCaseQuery.length });
    startIndex = foundIndex + lowerCaseQuery.length;
  }

  // Step 5 & 6: Map matches back to DOM and apply highlighting
  // We need to iterate through matches in reverse order to avoid issues with
  // splitText changing node indices.
  for (let i = match.length - 1; i >= 0; i--) {
    const { start: matchStart, end: matchEnd } = match[i];

    for (const tn of textNodes) {
      // Check if the current text node intersects with the highlight range
      const nodeStart = tn.startOffset;
      const nodeEnd = tn.endOffset;

      // Case 1: Match is entirely within this text node
      if (matchStart >= nodeStart && matchEnd <= nodeEnd) {
        const relativeStart = matchStart - nodeStart;
        const relativeEnd = matchEnd - nodeStart;
        applyHighlightToTextNode(tn.node, relativeStart, relativeEnd, highlightClass);
        break; // Match found and handled, move to next match
      }
      // Case 2: Match starts in this text node and spans into subsequent nodes
      else if (matchStart >= nodeStart && matchStart < nodeEnd && matchEnd > nodeEnd) {
        const relativeStart = matchStart - nodeStart;
        const firstPartEnd = nodeEnd - nodeStart; // Highlight until the end of this node
        applyHighlightToTextNode(tn.node, relativeStart, firstPartEnd, highlightClass);
        // Adjust matchStart for the next iteration to continue highlighting
        // from the start of the next relevant text node.
        match[i].start = nodeEnd; // Update the start of the current match to the end of this node
        // This will be picked up by the next text node in the loop
      }
      // Case 3: Match ends in this text node, having started in a previous one
      else if (matchStart < nodeStart && matchEnd > nodeStart && matchEnd <= nodeEnd) {
        const lastPartStart = 0; // Highlight from the beginning of this node
        const lastPartEnd = matchEnd - nodeStart;
        applyHighlightToTextNode(tn.node, lastPartStart, lastPartEnd, highlightClass);
        // This match is now fully handled across multiple nodes. Break and go to next original match.
        break;
      }
      // Case 4: Match completely encompasses this text node
      else if (matchStart < nodeStart && matchEnd > nodeEnd) {
        applyHighlightToTextNode(
          tn.node,
          0,
          tn.node.textContent!.length, // Highlight the entire node
          highlightClass,
        );
      }
    }
  }
}

function applyHighlightToTextNode(node: Text, start: number, end: number, highlightClass: string) {
  // node.splitText(end) splits the node into two:
  // - the original node (now containing text from start to end-1)
  // - a new Text node (containing text from end onwards)
  // We need to do this first to ensure our start offset is valid for the first split.
  if ((node.parentNode as HTMLElement)?.classList.contains(highlightClass)) {
    return; // Already part of a highlight, do not re-wrap
  }

  const after = node.splitText(end);
  const highlightedTextNode = node.splitText(start);

  const highlightSpan = document.createElement("span");
  highlightSpan.classList.add(highlightClass);

  // Move the text content that was just split out into the new span
  highlightSpan.appendChild(highlightedTextNode);

  // Insert the new span before the 'after' part (which is the remainder of the original node)
  // If 'after' is empty (match goes to the very end of the node), insert before 'after.nextSibling'
  // or simply append to parent if 'after' itself is the last child.
  node.parentNode?.insertBefore(highlightSpan, after);
}

// Function to remove all highlights
export function removeHighlights(
  paragraphElement: HTMLElement,
  highlightClass: string = "search-highlight",
): void {
  if (!paragraphElement) {
    return;
  }
  const highlightedSpans = paragraphElement.querySelectorAll(`.${highlightClass}`);
  highlightedSpans.forEach((span) => {
    // Move all children of the span directly into its parent
    while (span.firstChild) {
      span.parentNode?.insertBefore(span.firstChild, span);
    }
    // Remove the empty span itself
    span.parentNode?.removeChild(span);
  });
}
