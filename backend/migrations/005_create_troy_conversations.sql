-- ============================================
-- Migration 005: Troy Conversations
-- Persistent conversation storage for Troy AI chat
-- ============================================

-- troy_conversations: one row per conversation
create table troy_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  message_count integer default 0 not null
);

alter table troy_conversations enable row level security;

create policy "Users can manage their own conversations"
  on troy_conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_troy_conversations_user_updated
  on troy_conversations (user_id, updated_at desc);

-- troy_messages: individual messages within a conversation
create table troy_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references troy_conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now() not null
);

alter table troy_messages enable row level security;

create policy "Users can manage messages in their own conversations"
  on troy_messages for all
  using (
    exists (
      select 1 from troy_conversations
      where id = troy_messages.conversation_id
      and user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from troy_conversations
      where id = troy_messages.conversation_id
      and user_id = auth.uid()
    )
  );

create index idx_troy_messages_conversation_created
  on troy_messages (conversation_id, created_at asc);

-- Trigger: auto-update conversation metadata on new message
create or replace function update_conversation_on_message()
returns trigger as $$
begin
  update troy_conversations
  set
    updated_at = now(),
    message_count = message_count + 1
  where id = NEW.conversation_id;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger on_troy_message_insert
  after insert on troy_messages
  for each row
  execute function update_conversation_on_message();
