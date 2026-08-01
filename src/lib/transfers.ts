import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel, Transaction, Transfer, TransferInput } from "@/types/database";

type BalanceTransaction = Pick<Transaction, "channel_id" | "type" | "amount">;
type BalanceTransfer = Pick<Transfer, "from_channel_id" | "to_channel_id" | "amount">;

export function calculateChannelBalances(
  channels: Pick<Channel, "id">[],
  transactions: BalanceTransaction[],
  transfers: BalanceTransfer[]
) {
  const balances = channels.reduce<Record<string, number>>((acc, channel) => {
    acc[channel.id] = 0;
    return acc;
  }, {});

  for (const transaction of transactions) {
    if (!transaction.channel_id || balances[transaction.channel_id] === undefined) {
      continue;
    }

    balances[transaction.channel_id] +=
      transaction.type === "income" ? transaction.amount : -transaction.amount;
  }

  for (const transfer of transfers) {
    if (balances[transfer.from_channel_id] !== undefined) {
      balances[transfer.from_channel_id] -= transfer.amount;
    }

    if (balances[transfer.to_channel_id] !== undefined) {
      balances[transfer.to_channel_id] += transfer.amount;
    }
  }

  return balances;
}

type SaveTransferOptions = {
  supabase: SupabaseClient;
  householdId: string;
  userId: string;
  transferId?: string | null;
  values: TransferInput;
};

export async function saveTransfer({
  supabase,
  householdId,
  userId,
  transferId = null,
  values,
}: SaveTransferOptions): Promise<string | null> {
  const { error } = await supabase.rpc("save_transfer", {
    p_transfer_id: transferId,
    p_household_id: householdId,
    p_user_id: userId,
    p_from_channel_id: values.fromChannelId,
    p_to_channel_id: values.toChannelId,
    p_amount: values.amount,
    p_fee_amount: values.feeAmount,
    p_fee_category_id: values.feeCategoryId,
    p_note: values.note,
    p_transferred_at: values.transferredAt,
  });

  return error?.message || null;
}

export async function deleteTransfer(
  supabase: SupabaseClient,
  householdId: string,
  transferId: string
): Promise<string | null> {
  const { error } = await supabase.rpc("delete_transfer", {
    p_transfer_id: transferId,
    p_household_id: householdId,
  });

  return error?.message || null;
}
