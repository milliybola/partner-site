import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { Card, CardHeader, SettingRow, Switch } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { isShop } from '../../../core/lib/session';
import { useWorkSettings, type WorkSettings } from '../../../core/lib/workSettings';
import { usePlatformConfig } from '../../../core/lib/platformStage';

/** Ish tartibi (barcha qurilmalarda bir xil): Tez rejim va Ombor bo'limi. Rahbar va manager uchun. */
export const WorkModeCard: React.FC = () => {
  const toast = useToast();
  const { settings, loaded, save } = useWorkSettings();
  const [saving, setSaving] = useState<keyof WorkSettings | null>(null);
  const shop = isShop();
  // Ombor/texkarta — 2-bosqich (Q55): 1-bosqichda tumbler yo'q (backend ham yoqishni 403 qiladi)
  const { pos: posStage } = usePlatformConfig();

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
              ? "Yangi buyurtmani baribir o'zingiz «Qabul qilish» bilan qabul qilasiz. Keyingi qadamlar qisqaradi."
              : "Kichik kafe uchun. Yangi buyurtmani baribir o'zingiz «Qabul qilish» bilan qabul qilasiz; shundan keyin olib ketish va zal buyurtmasi bitta tugma bilan beriladi — «Tayyorlanmoqda», «Tayyor» bosqichlari yo'q."
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
        {!shop && posStage && (
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
