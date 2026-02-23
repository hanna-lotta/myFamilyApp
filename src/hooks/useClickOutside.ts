import { useEffect } from 'react';
import type { RefObject } from 'react';

type OutsideHandler = () => void;

const useClickOutside = <T extends HTMLElement>(
	ref: RefObject<T | null>,
	handler: OutsideHandler,
	enabled = true
) => {
	useEffect(() => {
		if (!enabled) return;

		const listener = (event: MouseEvent | TouchEvent) => {
			const target = event.target as Node | null;
			if (!target || !ref.current || ref.current.contains(target)) {
				return;
			}
			handler();
		};

		document.addEventListener('mousedown', listener);
		document.addEventListener('touchstart', listener);

		return () => {
			document.removeEventListener('mousedown', listener);
			document.removeEventListener('touchstart', listener);
		};
	}, [enabled, handler, ref]);
};

export default useClickOutside;
