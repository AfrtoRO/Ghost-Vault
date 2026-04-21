import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, StatusBar, Modal, KeyboardAvoidingView, Platform,
  Animated, Keyboard, Image, Dimensions, ActivityIndicator, TouchableWithoutFeedback
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Video } from 'expo-av';
import * as LocalAuthentication from 'expo-local-authentication';

const { width } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0E17', card: '#151A25', input: '#1E2532',
  primary: '#0066FF', primaryLight: '#0066FF20',
  accent: '#00D1FF', text: '#FFFFFF', subText: '#8B949E',
  border: '#232B3B', danger: '#FF4757', success: '#2ED573', warning: '#FFA502',
  vaultPrimary: '#5D3FD3', vaultBg: '#020202', vaultCard: '#0A0A0A', vaultBorder: '#1A1A1A'
};

const ENCRYPT_KEY = 11;
const encryptData = (dataObj) => JSON.stringify(dataObj || []).split('').map(c => (c.charCodeAt(0) + ENCRYPT_KEY).toString(16)).join('-');
const decryptData = (encryptedStr) => {
  try { 
    const parsed = JSON.parse(encryptedStr.split('-').map(h => String.fromCharCode(parseInt(h, 16) - ENCRYPT_KEY)).join('')); 
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
};

const generateSecureName = () => Array.from({length: 32}, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

const formatTime = (millis) => {
  if (!millis) return '00:00';
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

// بيانات بوت التليجرام الخاص بك
const BOT_TOKEN = '5865244887:AAH41ra4rwB_hOFL-NF9jtBWr8u-YlrV764';

const SecureMediaViewer = ({ media, onClose }) => {
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [status, setStatus] = useState({});
  const videoRef = useRef(null);
  const [barWidth, setBarWidth] = useState(0);

  const handleSkip = (direction) => {
    if (videoRef.current && status.positionMillis !== undefined) {
      const newPos = direction === 'forward' 
        ? Math.min(status.positionMillis + 10000, status.durationMillis || 0)
        : Math.max(status.positionMillis - 10000, 0);
      videoRef.current.setPositionAsync(newPos);
    }
  };

  const handleProgressBarPress = (e) => {
    if (barWidth > 0 && status.durationMillis) {
      const percentage = e.nativeEvent.locationX / barWidth;
      videoRef.current.setPositionAsync(percentage * status.durationMillis);
    }
  };

  const progressPercent = status.durationMillis ? (status.positionMillis / status.durationMillis) * 100 : 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Video 
        ref={videoRef}
        source={{ uri: media.uri }} 
        style={{ flex: 1 }} 
        useNativeControls={false} 
        resizeMode="contain" 
        shouldPlay={isPlaying} 
        isMuted={isMuted} 
        isLooping
        onPlaybackStatusUpdate={setStatus}
      />

      <View style={styles.customVideoControls}>
        <View style={styles.progressContainer}>
          <Text style={styles.timeText}>{formatTime(status.positionMillis)}</Text>
          <TouchableOpacity activeOpacity={0.9} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)} onPress={handleProgressBarPress} style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </TouchableOpacity>
          <Text style={styles.timeText}>{formatTime(status.durationMillis)}</Text>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.vidControlBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
            <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip('backward')}>
              <Ionicons name="play-back" size={20} color="#FFF" />
              <Text style={styles.skipTxt}>10s</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.vidControlBtn, { width: 60, height: 60, borderRadius: 30 }]} onPress={() => setIsPlaying(!isPlaying)}>
              <Ionicons name={isPlaying ? "pause" : "play"} size={32} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip('forward')}>
              <Ionicons name="play-forward" size={20} color="#FFF" />
              <Text style={styles.skipTxt}>10s</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.vidControlBtn, !isMuted && { backgroundColor: COLORS.success }]} onPress={() => setIsMuted(!isMuted)}>
            <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default function CovertVaultFull() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [media, setMedia] = useState([]);
  const [activeMedia, setActiveMedia] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState(0);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const [toastData, setToastData] = useState({ visible: false, type: 'info', title: '', msg: '' });
  const toastAnim = useRef(new Animated.Value(width)).current;
  const progressAnim = useRef(new Animated.Value(100)).current;

  useEffect(() => { loadEncryptedData(); }, []);

  const showToast = (type, title, msg) => {
    setToastData({ visible: true, type, title, msg });
    Animated.spring(toastAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }).start();
    progressAnim.setValue(100);
    Animated.timing(progressAnim, { toValue: 0, duration: 2500, useNativeDriver: false }).start(() => {
      Animated.timing(toastAnim, { toValue: width, duration: 300, useNativeDriver: true }).start(() => {
        setToastData({ visible: false, type: 'info', title: '', msg: '' });
      });
    });
  };

  const loadEncryptedData = async () => {
    const savedMedia = await AsyncStorage.getItem('cv_media_master');
    if (savedMedia) setMedia(decryptData(savedMedia) || []);
  };

  const saveEncryptedMedia = async (data) => {
    setMedia(data);
    await AsyncStorage.setItem('cv_media_master', encryptData(data));
  };

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true })
    ]).start();
  };

  const getExactPINs = () => {
    const now = new Date();
    const h = now.getHours(); const m = now.getMinutes();
    const h12 = h % 12 || 12;
    const padM = m < 10 ? '0' + m : m; const padH = h < 10 ? '0' + h : h;
    return [`${h12}${padM}`, `${h}${padM}`, `${padH}${padM}`];
  };

  const authenticateBiometrics = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) { setIsLoggedIn(true); setPassInput(''); return; }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Verify Identity', disableDeviceFallback: true, cancelLabel: 'Cancel' });
      if (result.success) { setIsLoggedIn(true); setPassInput(''); }
    } catch (e) { setIsLoggedIn(true); setPassInput(''); }
  };

  const handleLogin = () => {
    Keyboard.dismiss();
    const validPins = getExactPINs();
    if (validPins.includes(passInput)) {
      authenticateBiometrics();
    } else {
      triggerShake();
    }
  };

  // دالة سحب الفيديوهات من التليجرام
  const syncFromTelegram = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncCount(0);

    try {
      const offsetId = await AsyncStorage.getItem('tg_bot_offset') || '0';
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offsetId}`);
      const data = await response.json();

      if (!data.ok || data.result.length === 0) {
        showToast('info', 'Telegram', 'No new videos to sync.');
        setIsSyncing(false);
        return;
      }

      let newOffset = parseInt(offsetId);
      const newDownloadedMedia = [];

      for (const update of data.result) {
        newOffset = Math.max(newOffset, update.update_id + 1);
        const msg = update.message || update.channel_post;
        
        if (msg && msg.video) {
          const fileId = msg.video.file_id;
          const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
          const fileData = await fileRes.json();

          if (fileData.ok) {
            const filePath = fileData.result.file_path;
            const dlUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
            const ext = filePath.split('.').pop() || 'mp4';
            const secureName = `${generateSecureName()}.${ext}`;
            const secureLocalPath = FileSystem.documentDirectory + secureName;

            const dl = await FileSystem.downloadAsync(dlUrl, secureLocalPath);
            if (dl.uri) {
              newDownloadedMedia.push({
                id: Date.now().toString() + Math.random().toString(),
                uri: dl.uri,
                type: 'video',
                isFav: false,
                timestamp: Date.now()
              });
              setSyncCount(prev => prev + 1);
            }
          }
        }
      }

      if (newDownloadedMedia.length > 0) {
        saveEncryptedMedia([...newDownloadedMedia, ...media]);
        showToast('success', 'Synced', `Successfully imported ${newDownloadedMedia.length} videos.`);
      } else {
        showToast('info', 'Telegram', 'No videos found in recent messages.');
      }

      await AsyncStorage.setItem('tg_bot_offset', newOffset.toString());

    } catch (error) {
      showToast('danger', 'Error', 'Connection to Telegram failed.');
    } finally {
      setIsSyncing(false);
    }
  };

  const executeDelete = async () => {
    if (!confirmDel) return;
    const target = media.find(m => m.id === confirmDel);
    if (target) { try { await FileSystem.deleteAsync(target.uri); } catch (e) { } }
    saveEncryptedMedia(media.filter(m => m.id !== confirmDel));
    setConfirmDel(null);
  };

  const ToastComponent = () => {
    const icons = { success: 'checkmark-circle', danger: 'close-circle', warning: 'warning', info: 'information-circle' };
    const colors = { success: COLORS.success, danger: COLORS.danger, warning: COLORS.warning, info: COLORS.accent };
    return (
      <Animated.View style={[styles.sideToast, { transform: [{ translateX: toastAnim }] }]}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => setToastData({ visible: false, type: 'info', title: '', msg: '' })} style={styles.toastContent}>
          <Ionicons name={icons[toastData.type]} size={18} color={colors[toastData.type]} />
          <View style={{ marginLeft: 10, flex: 1 }}><Text style={styles.toastTitle}>{toastData.title}</Text><Text style={styles.toastMsg}>{toastData.msg}</Text></View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (!isLoggedIn) {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />
            <KeyboardAvoidingView style={styles.centerAll} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={styles.coverLogoBox}><Ionicons name="stats-chart" size={40} color={COLORS.primary} /></View>
              <Text style={styles.coverTitle}>NexTrade</Text>
              
              <Animated.View style={{ width: '100%', paddingHorizontal: 30, marginTop: 40, transform: [{ translateX: shakeAnim }] }}>
                <View style={styles.coverInputWrap}>
                  <Ionicons name="lock-closed-outline" size={20} color={COLORS.subText} style={styles.coverInputIcon} />
                  <TextInput style={styles.coverInput} placeholder="Password" placeholderTextColor={COLORS.subText} secureTextEntry value={passInput} onChangeText={setPassInput} keyboardAppearance="dark" />
                </View>
                <TouchableOpacity style={styles.coverBtn} onPress={handleLogin}>
                  <Text style={styles.coverBtnTxt}>Sign In</Text>
                </TouchableOpacity>
              </Animated.View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  if (activeMedia) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <SafeAreaView style={styles.safeArea}>
          <SecureMediaViewer media={activeMedia} onClose={() => setActiveMedia(null)} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.vaultBg }}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        
        <View style={styles.vaultHeader}>
          <View>
            <Text style={styles.vaultHeaderTitle}>Ghost Vault</Text>
            <Text style={styles.vaultHeaderSub}>{media.length} Secure Videos</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* زرار مزامنة التليجرام */}
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: COLORS.vaultPrimary + '20', borderColor: COLORS.vaultPrimary }]} onPress={syncFromTelegram}>
              {isSyncing ? <ActivityIndicator color={COLORS.vaultPrimary} size="small" /> : <Ionicons name="cloud-download" size={20} color={COLORS.vaultPrimary} />}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: COLORS.danger + '20', borderColor: 'transparent' }]} onPress={() => setIsLoggedIn(false)}>
              <Ionicons name="power" size={20} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.vidGrid}>
            {media.map(m => (
              <View key={m.id} style={styles.vidWrapper}>
                <TouchableOpacity style={styles.vidCard} onPress={() => setActiveMedia(m)}>
                  <Video source={{ uri: m.uri }} style={styles.vidThumb} resizeMode="cover" shouldPlay={false} />
                  <View style={styles.vidPlayOverlay}><Ionicons name="play" size={30} color="#FFF" /></View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.vidDelBtn} onPress={() => setConfirmDel(m.id)}>
                  <Ionicons name="trash" size={14} color="#FFF" />
                </TouchableOpacity>
              </View>
            ))}
            {media.length === 0 && !isSyncing && (
              <View style={styles.emptyState}>
                <Ionicons name="film-outline" size={50} color={COLORS.border} />
                <Text style={styles.emptyTxt}>No videos in vault.</Text>
                <Text style={{color: COLORS.subText, fontSize: 12, marginTop: 5}}>Forward videos to your bot and sync.</Text>
              </View>
            )}
          </View>
          <View style={{ height: 50 }} />
        </ScrollView>

        <Modal visible={isSyncing && syncCount > 0} transparent animationType="fade">
          <View style={styles.modalOverlayCen}>
            <View style={styles.confirmCard}>
              <Ionicons name="sync-circle" size={50} color={COLORS.vaultPrimary} style={{ marginBottom: 15 }} />
              <Text style={styles.confirmTitle}>Syncing Telegram...</Text>
              <Text style={{ color: COLORS.text, fontWeight: 'bold', marginTop: 10 }}>Downloaded: {syncCount}</Text>
            </View>
          </View>
        </Modal>

        <Modal visible={!!confirmDel} transparent animationType="fade">
          <View style={styles.modalOverlayCen}>
            <View style={styles.confirmCard}>
              <Ionicons name="warning" size={55} color={COLORS.danger} style={{ marginBottom: 15 }} />
              <Text style={styles.confirmTitle}>Purge Video?</Text>
              <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 25 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmDel(null)}><Text style={styles.cancelBtnTxt}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={styles.delBtn} onPress={executeDelete}><Text style={styles.delBtnTxt}>Purge</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <ToastComponent />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centerAll: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  coverLogoBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  coverTitle: { fontSize: 32, fontWeight: '900', color: COLORS.text, letterSpacing: -1 },
  coverInputWrap: { flexDirection: 'row', alignItems: 'center', height: 60, backgroundColor: COLORS.input, borderRadius: 16, paddingHorizontal: 15, borderWidth: 1, borderColor: COLORS.border },
  coverInputIcon: { marginRight: 10 },
  coverInput: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: '600' },
  coverBtn: { height: 60, width: '100%', backgroundColor: COLORS.primary, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 30 },
  coverBtnTxt: { color: '#FFF', fontSize: 17, fontWeight: 'bold' },
  
  vaultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.vaultBorder },
  vaultHeaderTitle: { fontSize: 28, fontWeight: '900', color: COLORS.text, letterSpacing: -1 },
  vaultHeaderSub: { fontSize: 14, color: COLORS.vaultPrimary, fontWeight: '800', marginTop: 2 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  listContainer: { flex: 1, padding: 20 },
  emptyState: { alignItems: 'center', width: '100%', marginTop: 80 },
  emptyTxt: { color: COLORS.subText, fontSize: 16, fontWeight: '700', marginTop: 15 },
  vidGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
  vidWrapper: { width: (width - 55) / 2, aspectRatio: 1, marginBottom: 15 },
  vidCard: { flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.vaultCard, borderWidth: 1, borderColor: COLORS.vaultBorder },
  vidThumb: { width: '100%', height: '100%' },
  vidPlayOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  vidDelBtn: { position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.danger, justifyContent: 'center', alignItems: 'center' },
  
  customVideoControls: { position: 'absolute', bottom: 40, width: '100%', paddingHorizontal: 20 },
  progressContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
  timeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  progressBarBg: { flex: 1, height: 20, justifyContent: 'center' },
  progressBarFill: { height: 6, backgroundColor: COLORS.success, borderRadius: 3 },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vidControlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  skipBtn: { alignItems: 'center', justifyContent: 'center', width: 40 },
  skipTxt: { color: '#FFF', fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  
  sideToast: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, right: 15, width: 220, backgroundColor: '#151A25', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#232B3B', zIndex: 9999 },
  toastContent: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  toastTitle: { color: COLORS.text, fontSize: 13, fontWeight: 'bold' },
  toastMsg: { color: COLORS.subText, fontSize: 11, marginTop: 1 },
  
  modalOverlayCen: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  confirmCard: { width: '100%', backgroundColor: COLORS.vaultCard, borderRadius: 28, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: COLORS.vaultBorder },
  confirmTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900', marginBottom: 10 },
  cancelBtn: { flex: 1, height: 55, backgroundColor: COLORS.vaultBg, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  cancelBtnTxt: { color: COLORS.text, fontWeight: '800', fontSize: 15 },
  delBtn: { flex: 1, height: 55, backgroundColor: COLORS.danger, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  delBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 15 }
});
