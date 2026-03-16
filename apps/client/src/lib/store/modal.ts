import { writable } from "svelte/store";

interface ModalOptions {
    title?: string;
    confirmText?: string;
    cancelText?: string;
    closeOnOverlayClick?: boolean;
}

interface ModalState {
    open: boolean;
    type: "alert" | "confirm";
    title?: string;
    message: string;
    confirmText: string;
    cancelText: string;
    closeOnOverlayClick: boolean;
    resolve?: (value: boolean) => void;
}

const defaultState: ModalState = {
    open: false,
    type: "alert",
    message: "",
    confirmText: "확인",
    cancelText: "취소",
    closeOnOverlayClick: true,
};

export const modalStore = writable<ModalState>({ ...defaultState });

export function openAlert(message: string, options?: ModalOptions): Promise<void> {
    return new Promise<void>((resolve) => {
        modalStore.update((prev) => {
            prev.resolve?.(false);
            return {
                open: true,
                type: "alert",
                message,
                title: options?.title,
                confirmText: options?.confirmText ?? "확인",
                cancelText: "취소",
                closeOnOverlayClick: options?.closeOnOverlayClick ?? true,
                resolve: () => resolve(),
            };
        });
    });
}

export function openConfirm(message: string, options?: ModalOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        modalStore.update((prev) => {
            prev.resolve?.(false);
            return {
                open: true,
                type: "confirm",
                message,
                title: options?.title,
                confirmText: options?.confirmText ?? "확인",
                cancelText: options?.cancelText ?? "취소",
                closeOnOverlayClick: options?.closeOnOverlayClick ?? true,
                resolve,
            };
        });
    });
}

export function closeModal(result: boolean) {
    modalStore.update((state) => {
        state.resolve?.(result);
        return { ...defaultState };
    });
}
