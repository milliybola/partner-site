import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { Card, CardHeader, SettingRow, Switch } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { isShop } from '../../../core/lib/session';
import { useWorkSettings, type WorkSettings } from '../../../core/lib/workSettings';

/** Ish tartibi (barcha qurilmalarda bir xil): Tez rejim va Ombor bo'limi. Rahbar va manager uchun. */
export const WorkModeCard: React.FC = () => {
  const toast = useToast();
  const { settings, loaded, save } = useWorkSettings();
  const [saving, setSaving] = useState<keyof WorkSettings | null>(null);
  const shop = isShop();

  const toggle = async (key: keyof WorkSettings, value: boolean) => {
    setSaving(key);
    try {
      await save({ [key]: value });
      toast.success('Saqlandi');
    } catch (err) {
      toast.error(getErrorMessage(err, "Sozlamani saqlab bo'lmadi."));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader title="Ish tartibi" icon={<Zap className="w-[18px] h-[18px]" />} />
      <div className="divide-y divide-edge">
        <SettingRow
          title="Tez rejim"
          description={
            shop
              ? "Yangi buyurtma o'zi qabul qilinadi — «Qabul qilish» bosish shart emas. Stol QR buyurtmasini baribir xodim tasdiqlaydi."
              : "Kichik kafe uchun. Yangi buyurtma (ilova, telegram) o'zi qabul qilinib oshxona printeriga chiqadi. Olib ketish va zal buyurtmasi bitta tugma bilan beriladi — «Tayyorlanmoqda», «Tayyor» bosqichlari yo'q. Keraksizini bekor qilasiz, xolos. Stol QR buyurtmasini esa har doim xodim tasdiqlaydi — u buyurtma uchun javobgar."
          }
          control={
            <Switch
              checked={settings.fast_mode}
              disabled={!loaded || saving !== null}
              onChange={(v) => toggle('fast_mode', v)}
              label="Tez rejim"
            />
          }
        />
        {!shop && (
          <SettingRow
            title="Ombor va texkarta"
            description="Xom ashyo qoldig'i, kirim, inventarizatsiya va taom tannarxi. Har kuni kirim kiritadigan restoranlar uchun — kichik kafega shart emas."
            control={
              <Switch
                checked={settings.warehouse_enabled}
                disabled={!loaded || saving !== null}
                onChange={(v) => toggle('warehouse_enabled', v)}
                label="Ombor va texkarta"
              />
            }
          />
        )}
      </div>
    </Card>
  );
};
