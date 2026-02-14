import { useState, useEffect, useMemo } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { RGBA } from '@opentui/core';
import { useColors } from '../contexts/ThemeContext.tsx';
import { useInputFocus } from '../contexts/InputContext.tsx';

const OVERLAY_BG = RGBA.fromValues(0.0, 0.0, 0.0, 0.5);

export interface CommandAction {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  commands: CommandAction[];
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const colors = useColors();
  const { width: termWidth, height: termHeight } = useTerminalDimensions();
  const { setInputFocused } = useInputFocus();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setInputFocused(true);
    return () => setInputFocused(false);
  }, [setInputFocused]);

  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    const lowerQuery = query.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(lowerQuery) ||
      cmd.id.toLowerCase().includes(lowerQuery)
    );
  }, [commands, query]);

  const width = Math.max(50, Math.min(termWidth - 4, 80));
  const maxVisibleItems = 15;
  const listHeight = Math.min(filteredCommands.length, maxVisibleItems);
  const height = Math.min(listHeight + 5, termHeight - 4);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useKeyboard((key) => {
    if (key.name === 'escape') {
      onClose();
      return;
    }

    if (key.name === 'return') {
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        onClose();
        selected.action();
      }
      return;
    }

    if (query === '' && !key.ctrl && !key.meta) {
      const keyStr = key.sequence || '';
      const matchingCmd = commands.find(cmd => cmd.shortcut === keyStr);
      if (matchingCmd) {
        onClose();
        matchingCmd.action();
        return;
      }
    }

    if (key.name === 'down' || (key.ctrl && key.name === 'n') || (query === '' && key.name === 'j')) {
      setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
      return;
    }

    if (key.name === 'up' || (key.ctrl && key.name === 'p') || (query === '' && key.name === 'k')) {
      setSelectedIndex(i => Math.max(i - 1, 0));
      return;
    }

    if (key.name === 'backspace') {
      setQuery(q => q.slice(0, -1));
      return;
    }

    if (key.sequence && key.sequence.length === 1 && /^[\w\-_., ~:;!@#$%^&*()]$/.test(key.sequence)) {
      setQuery(q => q + key.sequence);
      return;
    }
  });

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      zIndex={100}
      backgroundColor={OVERLAY_BG}
    >
      <box
        width={width}
        height={height}
        border
        borderStyle="double"
        borderColor={colors.primary}
        flexDirection="column"
        backgroundColor={colors.background}
        overflow="hidden"
      >
        <box padding={1} height={1}>
          <text height={1}>
            <span fg={colors.textMuted}>: </span>
            <span fg={colors.text}>{query}</span>
            <span fg={colors.primary}>│</span>
          </text>
        </box>

        <scrollbox flexGrow={1}>
          <box flexDirection="column">
            {filteredCommands.length === 0 ? (
              <box padding={1} height={1}>
                <text height={1} fg={colors.textMuted}>No matching commands</text>
              </box>
            ) : (
              filteredCommands.map((cmd, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                   <box
                     key={cmd.id}
                     flexDirection="row"
                     justifyContent="space-between"
                     paddingX={1}
                     height={1}
                     {...(isSelected ? { backgroundColor: colors.primary } : {})}
                   >
                    <text height={1} fg={isSelected ? colors.background : colors.text}>
                      {cmd.label}
                    </text>
                    {cmd.shortcut && (
                      <text height={1} fg={isSelected ? colors.background : colors.textSubtle}>
                        {cmd.shortcut}
                      </text>
                    )}
                  </box>
                );
              })
            )}
          </box>
        </scrollbox>

         <box paddingX={1} height={1}>
           <text height={1} fg={colors.textSubtle}>↑↓ navigate  Enter select  Esc close</text>
         </box>
      </box>
    </box>
  );
}
