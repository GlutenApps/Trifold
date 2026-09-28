import sax from 'sax';
import type { XmlNode } from './tree';

export interface RecordStreamHandlers {
  /** Called once with the root element's name and attributes. */
  onRoot?(name: string, attrs: Record<string, string>): void;
  /** Called with each completed top-level record element (a child of the root). */
  onRecord(node: XmlNode): void;
  onWarning?(message: string): void;
}

export interface RecordStream {
  write(chunk: string): void;
  end(): void;
}

/**
 * Streams an XML document and hands back one element tree per top-level record, so a 31 MB
 * compendium never has to be held in memory as a whole (DESIGN.md §6.1). Parse errors are
 * reported as warnings and parsing resumes (lenient by design).
 */
export function createRecordStream(handlers: RecordStreamHandlers): RecordStream {
  const parser = sax.parser(true, { trim: false, normalize: false, position: true });
  const stack: XmlNode[] = [];
  let sawRoot = false;
  let recordCount = 0;

  parser.onopentag = (tag) => {
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(tag.attributes)) attrs[k] = String(v);
    const node: XmlNode = { name: tag.name, attrs, text: '', children: [] };
    if (stack.length === 0) {
      if (!sawRoot) {
        sawRoot = true;
        handlers.onRoot?.(tag.name, attrs);
      }
      stack.push(node);
      return;
    }
    const parent = stack[stack.length - 1];
    if (stack.length > 1 && parent) parent.children.push(node);
    stack.push(node);
  };

  parser.onclosetag = () => {
    const node = stack.pop();
    if (node && stack.length === 1) {
      recordCount += 1;
      handlers.onRecord(node);
    }
  };

  const appendText = (value: string) => {
    const current = stack[stack.length - 1];
    if (current && stack.length > 1) current.text += value;
  };
  parser.ontext = appendText;
  parser.oncdata = appendText;

  parser.onerror = (err) => {
    handlers.onWarning?.(
      `XML error near line ${parser.line + 1}, record ${recordCount + 1}: ${err.message.split('\n')[0]}`,
    );
    // Clearing the error lets sax continue with the next record (the typings say Error only).
    (parser as { error: Error | null }).error = null;
  };

  return {
    write(chunk) {
      parser.write(chunk);
    },
    end() {
      parser.close();
    },
  };
}
