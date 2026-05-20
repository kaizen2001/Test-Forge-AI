import React, { useRef } from 'react';
import { TextField, Box } from '@mui/material';
import './EditableCell.css';

/**
 * EditableCell Component
 * Handles inline editing of test case fields
 * 
 * @param {string} tcId - Test case ID
 * @param {string} field - Field name being edited
 * @param {string|number} value - Current value
 * @param {boolean} multiline - Whether to show multiline input
 * @param {number} stepIdx - Step index for test steps
 * @param {object} editingCell - Current editing state
 * @param {string} editValue - Current edit value from parent state
 * @param {function} onStartEdit - Callback to start editing
 * @param {function} onSave - Callback to save changes
 * @param {function} onCancel - Callback to cancel editing
 */
export const EditableCell = ({
  tcId,
  field,
  value,
  multiline = false,
  stepIdx,
  editingCell,
  editValue,
  onStartEdit,
  onSave,
  onCancel,
}) => {
  const inputRef = useRef(null);

  const isEditing =
    editingCell &&
    editingCell.tcId === tcId &&
    editingCell.field === field &&
    editingCell.stepIdx === stepIdx;

  const handleSave = () => {
    if (!inputRef.current) return;
    const finalValue = inputRef.current.value || '';
    onSave(finalValue);
  };

  if (isEditing) {
    return (
      <TextField
        inputRef={inputRef}
        autoFocus
        fullWidth
        multiline={multiline}
        minRows={multiline ? 3 : 1}
        defaultValue={editValue}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !multiline) {
            e.preventDefault();
            handleSave();
          }
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && multiline && (e.ctrlKey || e.metaKey)) {
            handleSave();
          }
        }}
        size="small"
        className="editable-cell-input"
      />
    );
  }

  return (
    <Box
      onClick={() => onStartEdit(tcId, field, stepIdx, value)}
      className="editable-cell"
    >
      {value || (
        <span className="editable-cell__placeholder">Click to edit…</span>
      )}
    </Box>
  );
};
