import { useState, useEffect , useRef} from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, Smile, Music } from "lucide-react";

const ChatPanel = ({ userName, roomCode }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef(null);

  // Load existing messages and subscribe
  useEffect(() => {
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("room_code", roomCode)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error.message);
        return;
      }
      setMessages(data || []);
    };

    loadMessages();

    const subscription = supabase
      .channel(`room_chat_${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          setMessages((prev) => {if (prev.find((m) => m.id === payload.new.id)) return prev;
      return [...prev, payload.new];});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [roomCode]);

  // Send message
  const handleSendMessage = async () => {
  if (!newMessage.trim()) return;

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      room_code: roomCode,
      user_name: userName,
      message: newMessage,
      type: "message",
    })
    // .select(); // 👈 this makes Supabase return the inserted row

  if (error) {
    console.error("Error sending message:", error.message);
  } else if (data && data.length > 0) {
    // add to state immediately (with correct id)
    setMessages((prev) => [...prev, data[0]]);
  }

  setNewMessage("");
};


  const handleKeyPress = (e) => {
    if (e.key === "Enter") handleSendMessage();
  };

  //Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="space-y-4">
      {/* Chat Messages */}
      <ScrollArea className="h-80 w-full rounded-lg border border-border bg-muted/20 p-4">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.type === "system" ? "justify-center" : ""}`}
            >
              {msg.type === "system" ? (
                <div className="text-center">
                  <Badge variant="secondary" className="text-xs">
                    {msg.message}
                  </Badge>
                </div>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-sm">
                    🎵
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-foreground text-sm">
                        {msg.user_name === userName ? `${msg.user_name} (You)` : msg.user_name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {msg.type === "song" && (
                        <Badge variant="outline" className="text-xs">
                          <Music className="w-3 h-3 mr-1" />
                          Song
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground break-words">{msg.message}</p>
                  </div>
                </>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Message Input */}
      <div className="flex gap-2">
        <Input
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          className="flex-1 bg-input border-border text-foreground"
        />
        <Button variant="ghost" size="sm">
          <Smile className="w-4 h-4" />
        </Button>
        <Button variant="hero" size="sm" onClick={handleSendMessage}>
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {/* Quick Reactions */}
      <div className="flex gap-2 flex-wrap">
        {["🔥", "💯", "🎵", "👏", "😍", "🚀"].map((emoji) => (
          <Button
            key={emoji}
            variant="outline"
            size="sm"
            className="text-lg p-2 h-auto"
            onClick={() => setNewMessage(newMessage + emoji)}
          >
            {emoji}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default ChatPanel;
