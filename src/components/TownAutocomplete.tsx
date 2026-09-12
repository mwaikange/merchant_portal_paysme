import {
  ChangeEvent,
  forwardRef,
  KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Input } from "@/components/ui/input";
import { getNamibianTownSuggestions } from "@/lib/namibianTowns";
import { cn } from "@/lib/utils";

type TownAutocompleteProps = React.InputHTMLAttributes<HTMLInputElement> & {
  onValueChange?: (value: string) => void;
};

export const TownAutocomplete = forwardRef<
  HTMLInputElement,
  TownAutocompleteProps
>(
  (
    {
      id,
      value,
      className,
      onChange,
      onFocus,
      onBlur,
      onKeyDown,
      onValueChange,
      ...props
    },
    forwardedRef
  ) => {
    const generatedId = useId().replace(/:/g, "");
    const inputId = id || `town-${generatedId}`;
    const listId = `${inputId}-suggestions`;
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const suggestions = getNamibianTownSuggestions(String(value || ""));

    useEffect(() => {
      const closeOnOutsidePress = (event: PointerEvent) => {
        if (!wrapperRef.current?.contains(event.target as Node)) {
          setIsOpen(false);
          setActiveIndex(-1);
        }
      };
      document.addEventListener("pointerdown", closeOnOutsidePress);
      return () =>
        document.removeEventListener("pointerdown", closeOnOutsidePress);
    }, []);

    useEffect(() => {
      if (activeIndex >= suggestions.length) setActiveIndex(-1);
    }, [activeIndex, suggestions.length]);

    const setRefs = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };

    const selectTown = (town: string) => {
      if (onValueChange) onValueChange(town);
      else {
        onChange?.({
          target: { value: town },
          currentTarget: { value: town },
        } as ChangeEvent<HTMLInputElement>);
      }
      setIsOpen(false);
      setActiveIndex(-1);
      requestAnimationFrame(() => inputRef.current?.focus());
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;

      if (event.key === "Escape") {
        setIsOpen(false);
        setActiveIndex(-1);
        return;
      }
      if (!suggestions.length) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex((current) =>
          current < suggestions.length - 1 ? current + 1 : 0
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex((current) =>
          current > 0 ? current - 1 : suggestions.length - 1
        );
      } else if (event.key === "Enter" && isOpen && activeIndex >= 0) {
        event.preventDefault();
        selectTown(suggestions[activeIndex]);
      }
    };

    const showSuggestions = isOpen && suggestions.length > 0;

    return (
      <div ref={wrapperRef} className="relative w-full">
        <Input
          {...props}
          ref={setRefs}
          id={inputId}
          value={value}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={listId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          autoComplete="address-level2"
          maxLength={120}
          className={cn(className)}
          onChange={(event) => {
            onChange?.(event);
            onValueChange?.(event.target.value);
            setIsOpen(event.target.value.trim().length >= 3);
            setActiveIndex(-1);
          }}
          onFocus={(event) => {
            onFocus?.(event);
            if (String(value || "").trim().length >= 3) setIsOpen(true);
          }}
          onBlur={(event) => {
            onBlur?.(event);
            window.setTimeout(() => {
              if (!wrapperRef.current?.contains(document.activeElement)) {
                setIsOpen(false);
                setActiveIndex(-1);
              }
            }, 0);
          }}
          onKeyDown={handleKeyDown}
        />
        {showSuggestions && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+2px)] z-[99999] max-h-[170px] w-full overflow-y-auto rounded-b-md border border-slate-300 bg-white py-0 text-slate-900 shadow-lg"
          >
            {suggestions.map((town, index) => (
              <li
                key={town}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  className={cn(
                    "flex min-h-[34px] w-full items-center px-2.5 py-2 text-left text-sm transition-colors hover:bg-slate-100 active:bg-slate-200",
                    index === activeIndex && "bg-slate-100"
                  )}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => selectTown(town)}
                >
                  {town}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
);

TownAutocomplete.displayName = "TownAutocomplete";
