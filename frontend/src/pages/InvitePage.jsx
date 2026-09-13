import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import { useChatStore } from "../store/useChatStore";
import PageLoader from "../components/PageLoader";

// Landing spot for a "Message me" share link (see ChatSidebar's Users
// tab). Anyone who's signed in and opens it gets dropped straight into a
// DM with whoever shared it — this is the invite path now that there's
// no directory to browse someone up in.
function InvitePage() {
  const { userId } = useParams();
  const getUserById = useChatStore((state) => state.getUserById);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);

  const [status, setStatus] = useState("loading"); // "loading" | "done" | "error"

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const user = await getUserById(userId);
      if (cancelled) return;

      if (user) {
        setActiveConversationId(user._id);
        setStatus("done");
      } else {
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, getUserById, setActiveConversationId]);

  if (status === "loading") return <PageLoader />;

  return <Navigate to="/" replace />;
}

export default InvitePage;
