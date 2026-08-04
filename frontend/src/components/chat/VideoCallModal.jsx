import { useEffect, useRef } from "react";
import { Avatar, Button } from "@heroui/react";
import { PhoneOffIcon, PhoneIcon } from "lucide-react";
import { useCallStore } from "../../store/useCallStore";

export function VideoCallModal() {
  const callStatus = useCallStore((state) => state.callStatus);
  const callType = useCallStore((state) => state.callType);
  const localStream = useCallStore((state) => state.localStream);
  const remoteStream = useCallStore((state) => state.remoteStream);
  const callPartner = useCallStore((state) => state.callPartner);
  const acceptCall = useCallStore((state) => state.acceptCall);
  const rejectCall = useCallStore((state) => state.rejectCall);
  const endCall = useCallStore((state) => state.endCall);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }

    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;

      // Chrome sometimes requires play() after attaching srcObject
      remoteAudioRef.current
        .play()
        .catch((err) => console.log("Audio autoplay blocked:", err));
    }
  }, [remoteStream]);

  if (callStatus === "idle") return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <p className="mb-4 mt-6 text-center text-lg text-white">
        {callStatus === "calling" && `Calling ${callPartner?.fullName}...`}
        {callStatus === "incoming" && `${callPartner?.fullName} is calling...`}
        {callStatus === "connected" && callPartner?.fullName}
      </p>

      {callType === "video" ? (
        <div className="relative flex h-full w-full flex-1 items-center justify-center overflow-hidden">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />

          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute right-4 top-4 w-28 rounded-lg border-2 border-white shadow-lg sm:w-36"
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <Avatar className="h-36 w-36">
            <Avatar.Image
              src={callPartner?.profilePic}
              alt={callPartner?.fullName}
            />
            <Avatar.Fallback className="text-4xl">
              {callPartner?.fullName?.[0]}
            </Avatar.Fallback>
          </Avatar>

          <div className="text-center">
            <h2 className="text-2xl font-semibold text-white">
              {callPartner?.fullName}
            </h2>

            <p className="mt-2 text-gray-400">
              Audio Call
            </p>
          </div>

          {/* Hidden element that plays the remote audio */}
          <audio
            ref={remoteAudioRef}
            autoPlay
            playsInline
          />
        </div>
      )}

      <div className="mb-8 mt-6 flex justify-center gap-4">
        {callStatus === "incoming" ? (
          <>
            <Button
              isIconOnly
              className="bg-green-500 text-white"
              onPress={acceptCall}
            >
              <PhoneIcon className="size-5" />
            </Button>

            <Button
              isIconOnly
              className="bg-red-500 text-white"
              onPress={rejectCall}
            >
              <PhoneOffIcon className="size-5" />
            </Button>
          </>
        ) : (
          <Button
            isIconOnly
            className="bg-red-500 text-white"
            onPress={endCall}
          >
            <PhoneOffIcon className="size-5" />
          </Button>
        )}
      </div>
    </div>
  );
}