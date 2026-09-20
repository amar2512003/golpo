import { useState } from "react";
import { Button } from "@heroui/react";
import { ListChecksIcon, LoaderIcon, PlusIcon, XIcon } from "lucide-react";

const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

export function PollCreatorModal({ onClose, onCreate }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const updateOption = (index, value) => {
    setOptions((prev) => prev.map((option, i) => (i === index ? value : option)));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, ""]);
  };

  const removeOption = (index) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    const trimmedQuestion = question.trim();
    const cleanOptions = options.map((option) => option.trim()).filter(Boolean);

    if (!trimmedQuestion) {
      setError("Give the poll a question");
      return;
    }
    if (cleanOptions.length < MIN_OPTIONS) {
      setError("Add at least 2 options");
      return;
    }

    setError("");
    setIsSending(true);
    const didSend = await onCreate({ question: trimmedQuestion, options: cleanOptions });
    setIsSending(false);

    if (didSend) onClose();
    else setError("Couldn't create the poll. Try again.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <p className="text-[15px] font-semibold">Create poll</p>
          <Button variant="ghost" size="sm" isIconOnly onPress={onClose} aria-label="Close">
            <XIcon className="size-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a question"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-accent"
          />

          <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted">
            Options ({options.length}/{MAX_OPTIONS})
          </p>

          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={option}
                  onChange={(event) => updateOption(index, event.target.value)}
                  placeholder={`Option ${index + 1}`}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-accent"
                />
                {options.length > MIN_OPTIONS ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    onPress={() => removeOption(index)}
                    aria-label={`Remove option ${index + 1}`}
                  >
                    <XIcon className="size-4" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          {options.length < MAX_OPTIONS ? (
            <button
              type="button"
              onClick={addOption}
              className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-accent hover:bg-accent-soft"
            >
              <PlusIcon className="size-4" strokeWidth={2} aria-hidden />
              Add option
            </button>
          ) : null}

          {error ? <p className="mt-3 text-xs font-medium text-red-500">{error}</p> : null}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <Button variant="primary" fullWidth isDisabled={isSending} onPress={handleCreate}>
            {isSending ? (
              <>
                <LoaderIcon className="size-4 animate-spin" aria-hidden />
                Creating...
              </>
            ) : (
              <>
                <ListChecksIcon className="size-4" aria-hidden />
                Create poll
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
