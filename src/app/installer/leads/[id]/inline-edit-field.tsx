'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface InlineEditFieldProps {
  leadId: string;
  field: string;
  value: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'number';
  prefix?: string;
}

export function InlineEditField({
  leadId,
  field,
  value,
  label,
  type = 'text',
  prefix,
}: InlineEditFieldProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createClient();
      const updateData: Record<string, unknown> = {
        [field]: type === 'number' ? parseFloat(editValue) : editValue,
        updated_at: new Date().toISOString(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('leads')
        .update(updateData)
        .eq('id', leadId);

      if (error) throw error;

      setIsEditing(false);
      router.refresh();
    } catch (err) {
      console.error('Error updating field:', err);
      setEditValue(value);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div>
        <p className="text-sm text-[#445e5f]">{label}</p>
        <div className="flex items-center gap-2 mt-1">
          {prefix && <span className="text-gray-500">{prefix}</span>}
          <input
            ref={inputRef}
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            className="flex-1 px-2 py-1 text-base font-medium border border-[#a7e26e] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a7e26e]/30 disabled:opacity-50"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="cursor-pointer group"
    >
      <p className="text-sm text-[#445e5f]">{label}</p>
      <p className="font-medium group-hover:text-[#a7e26e] transition-colors flex items-center gap-1">
        {prefix}{value || <span className="text-gray-400 italic">Sin datos</span>}
        <svg
          className="w-3.5 h-3.5 text-[#a7e26e] opacity-0 group-hover:opacity-100 transition-opacity"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </p>
    </div>
  );
}

interface InlineEditSelectProps {
  leadId: string;
  field: string;
  value: string;
  label: string;
  options: readonly { value: string; label: string }[];
}

export function InlineEditSelect({
  leadId,
  field,
  value,
  label,
  options,
}: InlineEditSelectProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (isEditing && selectRef.current) {
      selectRef.current.focus();
    }
  }, [isEditing]);

  const handleChange = async (newValue: string) => {
    if (newValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('leads')
        .update({ [field]: newValue, updated_at: new Date().toISOString() })
        .eq('id', leadId);

      if (error) throw error;

      setIsEditing(false);
      router.refresh();
    } catch (err) {
      console.error('Error updating field:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const displayLabel = options.find((o) => o.value === value)?.label || value;

  if (isEditing) {
    return (
      <div>
        <p className="text-sm text-[#445e5f]">{label}</p>
        <select
          ref={selectRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setIsEditing(false)}
          disabled={isSaving}
          className="mt-1 w-full px-2 py-1 text-base font-medium border border-[#a7e26e] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#a7e26e]/30 disabled:opacity-50 bg-white"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="cursor-pointer group"
    >
      <p className="text-sm text-[#445e5f]">{label}</p>
      <p className="font-medium group-hover:text-[#a7e26e] transition-colors flex items-center gap-1">
        {displayLabel}
        <svg
          className="w-3.5 h-3.5 text-[#a7e26e] opacity-0 group-hover:opacity-100 transition-opacity"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </p>
    </div>
  );
}
