'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DeleteLeadButtonProps {
  leadId: string;
  leadName: string;
}

export function DeleteLeadButton({ leadId, leadName }: DeleteLeadButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/installer/leads');
      } else {
        console.error('Failed to delete lead');
        setIsDeleting(false);
        setShowConfirm(false);
      }
    } catch (err) {
      console.error('Delete error:', err);
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-3 w-full p-3 rounded-xl bg-red-50 hover:bg-red-100 transition-colors text-red-600"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        <span className="font-medium">Eliminar lead</span>
      </button>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowConfirm(false)}>
          <div className="bg-white rounded-xl shadow-lg p-6 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg text-gray-900 mb-2">
              Eliminar lead
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              ¿Estás seguro de que quieres eliminar a <strong>{leadName}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
