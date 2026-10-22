import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Trash2, Info, CheckCircle2 } from 'lucide-react';
import { sound } from '../utils/sound';

/**
 * Universal Unified Dialog Component for JEE Rivals.
 * 
 * Guarantees:
 * 1. Always portaled directly to `document.body`, completely immune to any parent CSS
 *    transforms (like `.page-transition`), animations, or overflow clipping.
 * 2. Perfect viewport centering via fixed flexbox layout with 100dvh fallback.
 * 3. Automatic body scroll lock (`overflow: hidden`) on mount with clean restoration.
 * 4. Keyboard accessibility (Escape key closes dialog).
 * 5. Backdrop click detection and click-outside dismissal.
 */
export default function Dialog({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: IconComponent,
  variant = 'default', // 'default' | 'danger' | 'warning' | 'info' | 'success'
  maxWidth = 'md', // 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  children,
  showCloseButton = true,
  className = '',
  closeOnBackdrop = true,
}) {
  const panelRef = useRef(null);

  // Lock body scroll while dialog is open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) {
        sound.click();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }[maxWidth] || 'max-w-md';

  const variantPanelClass = {
    danger: 'jee-dialog-panel--danger',
    warning: 'jee-dialog-panel--warning',
    info: 'jee-dialog-panel--info',
    success: 'jee-dialog-panel--success',
    default: '',
  }[variant] || '';

  const variantIconColor = {
    danger: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
    warning: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
    info: 'text-sky-400 bg-sky-500/15 border-sky-500/30',
    success: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    default: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
  }[variant] || 'text-orange-400 bg-orange-500/15 border-orange-500/30';

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      className="jee-dialog-backdrop"
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget && onClose) {
          sound.click();
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className={`jee-dialog-panel ${variantPanelClass} ${maxWidthClass} p-6 sm:p-7 ${className}`}
      >
        {/* Header Row if title or icon provided */}
        {(title || IconComponent || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              {IconComponent && (
                <div className={`p-2.5 rounded-2xl border ${variantIconColor} shrink-0`}>
                  <IconComponent className="w-5 h-5" />
                </div>
              )}
              <div>
                {title && (
                  <h3 className="text-lg font-black text-white tracking-tight leading-snug">
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <span className="text-xs text-slate-400 font-mono block mt-0.5">
                    {subtitle}
                  </span>
                )}
              </div>
            </div>

            {showCloseButton && onClose && (
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  onClose();
                }}
                className="p-1.5 -mr-1.5 -mt-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Dialog Body Content */}
        {children}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

/**
 * Standardized High-Impact Confirmation Dialog.
 * Used for actions like deleting test records, forfeiting matches, and data resets.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'info'
  icon = null,
  isLoading = false,
  loadingText = 'Processing...',
  confirmDisabled = false,
}) {
  const DefaultIcon = {
    danger: Trash2,
    warning: AlertTriangle,
    info: Info,
    success: CheckCircle2,
  }[variant] || AlertTriangle;

  const ActiveIcon = icon || DefaultIcon;

  const confirmBtnStyles = {
    danger: 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-950/60',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-950/60',
    info: 'bg-sky-600 hover:bg-sky-700 text-white shadow-lg shadow-sky-950/60',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-950/60',
    default: 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-950/60',
  }[variant] || 'bg-rose-600 hover:bg-rose-700 text-white';

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isLoading ? undefined : onClose}
      variant={variant}
      maxWidth="md"
      title={title}
      subtitle={subtitle}
      icon={ActiveIcon}
      showCloseButton={!isLoading}
    >
      <div className="space-y-5">
        {description && (
          <div className="text-xs text-slate-300 leading-relaxed">
            {description}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/5">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              sound.click();
              if (onClose) onClose();
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={isLoading || confirmDisabled}
            onClick={onConfirm}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 disabled:opacity-50 ${confirmBtnStyles}`}
          >
            {isLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{loadingText}</span>
              </>
            ) : (
              <>
                <ActiveIcon className="w-3.5 h-3.5" />
                <span>{confirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
