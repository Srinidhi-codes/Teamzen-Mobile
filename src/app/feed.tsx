import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Image,
  Alert,
  Platform,
  Share,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import { ImageViewerModal } from '../components/ImageViewerModal';
import { graphqlRequest, API_URL } from '../services/api';
import { WebSocketService } from '../services/websocket';

// =====================================================
// GRAPHQL QUERIES & MUTATIONS
// =====================================================
const GET_POSTS_QUERY = `
  query GetPosts($page: Int!, $pageSize: Int!, $authorId: String) {
    posts(page: $page, pageSize: $pageSize, authorId: $authorId) {
      results {
        id
        title
        content
        mediaUrls
        likesCount
        commentsCount
        viewsCount
        scheduledFor
        isScheduled
        createdAt
        hasLiked
        likers {
          id
          firstName
          lastName
          profilePictureUrl
        }
        author {
          id
          firstName
          lastName
          email
          profilePictureUrl
        }
        poll {
          id
          question
          isMultipleChoice
          totalVotes
          hasVoted
          userVotedOptionId
          userVotedOptionIds
          options {
            id
            text
            votesCount
            percentage
          }
        }
      }
      total
      page
      pageSize
    }
  }
`;

const GET_POST_COMMENTS_QUERY = `
  query GetPostComments($postId: String!, $limit: Int, $offset: Int) {
    post(id: $postId) {
      id
      topLevelCommentsCount
      comments(limit: $limit, offset: $offset) {
        id
        content
        likesCount
        isPinned
        createdAt
        hasLiked
        author {
          id
          firstName
          lastName
          email
          profilePictureUrl
        }
      }
    }
  }
`;

const CREATE_POST_MUTATION = `
  mutation CreatePost(
    $title: String!
    $content: String!
    $mediaB64: [String!]
    $scheduledFor: String
    $pollQuestion: String
    $pollOptions: [String!]
    $pollIsMultipleChoice: Boolean
  ) {
    createPost(
      title: $title
      content: $content
      mediaB64: $mediaB64
      scheduledFor: $scheduledFor
      pollQuestion: $pollQuestion
      pollOptions: $pollOptions
      pollIsMultipleChoice: $pollIsMultipleChoice
    ) {
      id
      title
      content
      mediaUrls
      likesCount
      commentsCount
      viewsCount
      createdAt
      hasLiked
      author {
        id
        firstName
        lastName
        email
        profilePictureUrl
      }
      poll {
        id
        question
        isMultipleChoice
        totalVotes
        hasVoted
        userVotedOptionId
        userVotedOptionIds
        options {
          id
          text
          votesCount
          percentage
        }
      }
    }
  }
`;

const TOGGLE_POST_LIKE_MUTATION = `
  mutation TogglePostLike($postId: String!) {
    togglePostLike(postId: $postId)
  }
`;

const VOTE_POLL_MUTATION = `
  mutation VotePoll($pollId: String!, $optionId: String!) {
    votePoll(pollId: $pollId, optionId: $optionId) {
      id
      question
      isMultipleChoice
      totalVotes
      hasVoted
      userVotedOptionId
      userVotedOptionIds
      options {
        id
        text
        votesCount
        percentage
      }
    }
  }
`;

const CREATE_COMMENT_MUTATION = `
  mutation CreateComment($postId: String!, $content: String!, $parentId: String) {
    createComment(postId: $postId, content: $content, parentId: $parentId) {
      id
      content
      likesCount
      createdAt
      hasLiked
      author {
        id
        firstName
        lastName
        email
        profilePictureUrl
      }
    }
  }
`;

const TOGGLE_COMMENT_LIKE_MUTATION = `
  mutation ToggleCommentLike($commentId: String!) {
    toggleCommentLike(commentId: $commentId)
  }
`;

const DELETE_POST_MUTATION = `
  mutation DeletePost($id: String!) {
    deletePost(id: $id)
  }
`;

// =====================================================
// DATA TYPES
// =====================================================
interface PollOption {
  id: string;
  text: string;
  votesCount: number;
  percentage: number;
}

interface PollData {
  id: string;
  question: string;
  isMultipleChoice: boolean;
  totalVotes: number;
  hasVoted: boolean;
  userVotedOptionId?: string | null;
  userVotedOptionIds?: string[];
  options: PollOption[];
}

interface FeedAuthor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePictureUrl?: string | null;
}

interface FeedPost {
  id: string;
  title?: string | null;
  content: string;
  mediaUrls?: string[];
  likesCount: number;
  commentsCount: number;
  viewsCount?: number;
  createdAt: string;
  hasLiked: boolean;
  author: FeedAuthor;
  poll?: PollData | null;
}

interface FeedComment {
  id: string;
  content: string;
  likesCount: number;
  createdAt: string;
  hasLiked: boolean;
  author: FeedAuthor;
}

const SUGGESTED_TAGS = ['#Announcement', '#Important', '#Update', '#Kudos', '#General'];

function getAbsoluteUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Just now';
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch {
    return dateString;
  }
}

export default function FeedScreen() {
  const router = useRouter();
  const { colors, accentColors, isDark } = useAppTheme();
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'announcements' | 'polls' | 'updates'>('all');

  useEffect(() => {
    graphqlRequest<{ me: { email: string } }>(`query GetMeEmail { me { email } }`)
      .then((res) => {
        if (res?.me?.email) setCurrentUserEmail(res.me.email.toLowerCase());
      })
      .catch(() => {});
  }, []);

  // Preview Image
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Comments Modal State
  const [activeCommentsPost, setActiveCommentsPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Create Post Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollIsMultipleChoice, setPollIsMultipleChoice] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Fetch Posts
  const fetchPosts = useCallback(async (pageNum = 1, append = false) => {
    try {
      const data = await graphqlRequest<{
        posts: {
          results: FeedPost[];
          total: number;
          page: number;
          pageSize: number;
        };
      }>(GET_POSTS_QUERY, {
        page: pageNum,
        pageSize: 15,
      });

      const newResults = data.posts?.results || [];
      if (append) {
        setPosts((prev) => [...prev, ...newResults]);
      } else {
        setPosts(newResults);
      }
      setHasMore(newResults.length >= 15);
      setPage(pageNum);
    } catch (err: any) {
      console.error('Error fetching feed posts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts(1, false);
  }, [fetchPosts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPosts(1, false);
  };

  // Real-time WebSocket sync
  useEffect(() => {
    const unsub = WebSocketService.addMessageListener((msg: any) => {
      if (msg?.level === 'feed_update') {
        if (msg.action === 'post_created' || msg.action === 'create_post') {
          fetchPosts(1, false);
        } else if (msg.action === 'post_liked' && msg.post_id) {
          setPosts((prev) =>
            prev.map((p) =>
              p.id === String(msg.post_id)
                ? { ...p, likesCount: msg.likes_count ?? p.likesCount }
                : p
            )
          );
        } else if (msg.action === 'post_deleted' && msg.post_id) {
          setPosts((prev) => prev.filter((p) => p.id !== String(msg.post_id)));
        }
      }
    });

    return () => unsub();
  }, [fetchPosts]);

  // Like Post
  const handleToggleLike = async (postId: string) => {
    // Optimistic toggle
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const wasLiked = p.hasLiked;
          return {
            ...p,
            hasLiked: !wasLiked,
            likesCount: wasLiked ? Math.max(0, p.likesCount - 1) : p.likesCount + 1,
          };
        }
        return p;
      })
    );

    try {
      await graphqlRequest(TOGGLE_POST_LIKE_MUTATION, { postId });
    } catch (err: any) {
      // Revert on error
      fetchPosts(page, false);
    }
  };

  // Vote Poll
  const handleVotePoll = async (pollId: string, optionId: string, postId: string) => {
    try {
      const data = await graphqlRequest<{
        votePoll: PollData;
      }>(VOTE_POLL_MUTATION, { pollId, optionId });

      if (data?.votePoll) {
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, poll: data.votePoll } : p))
        );
      }
    } catch (err: any) {
      Alert.alert('Vote Failed', err.message || 'Could not register your vote.');
    }
  };

  // Open Comments Modal
  const handleOpenComments = async (post: FeedPost) => {
    setActiveCommentsPost(post);
    setCommentsLoading(true);
    try {
      const data = await graphqlRequest<{
        post: {
          comments: FeedComment[];
        };
      }>(GET_POST_COMMENTS_QUERY, {
        postId: post.id,
        limit: 30,
        offset: 0,
      });

      setComments(data.post?.comments || []);
    } catch (err: any) {
      console.error('Error fetching comments:', err);
    } finally {
      setCommentsLoading(false);
    }
  };

  // Submit Comment
  const handleSendComment = async () => {
    if (!commentInput.trim() || !activeCommentsPost) return;
    const text = commentInput.trim();
    setIsSubmittingComment(true);

    try {
      const data = await graphqlRequest<{
        createComment: FeedComment;
      }>(CREATE_COMMENT_MUTATION, {
        postId: activeCommentsPost.id,
        content: text,
      });

      if (data?.createComment) {
        setComments((prev) => [data.createComment, ...prev]);
        setCommentInput('');
        setPosts((prev) =>
          prev.map((p) =>
            p.id === activeCommentsPost.id
              ? { ...p, commentsCount: p.commentsCount + 1 }
              : p
          )
        );
      }
    } catch (err: any) {
      Alert.alert('Comment Failed', err.message || 'Could not post your comment.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Delete Post
  const handleDeletePost = (postId: string) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setPosts((prev) => prev.filter((p) => p.id !== postId));
            try {
              await graphqlRequest(DELETE_POST_MUTATION, { id: postId });
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete post.');
              fetchPosts(1, false);
            }
          },
        },
      ]
    );
  };

  // Share Post
  const handleShare = async (post: FeedPost) => {
    try {
      const cleanContent = post.content.replace(/<[^>]*>?/gm, '').trim();
      await Share.share({
        message: `${post.title ? `${post.title}\n\n` : ''}${cleanContent}`,
        title: post.title || 'Teamzen Company Feed',
      });
    } catch (e) {}
  };

  // Image Picker for Create Post
  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]?.base64) {
        const asset = result.assets[0];
        const mime = asset.mimeType || 'image/jpeg';
        setSelectedImageBase64(`data:${mime};base64,${asset.base64}`);
      }
    } catch (err: any) {
      Alert.alert('Image Error', err.message || 'Unable to attach image.');
    }
  };

  // Publish New Post
  const handlePublishPost = async () => {
    const stripped = newPostContent.replace(/<[^>]*>?/gm, '').trim();
    if (!newPostTitle.trim() && !stripped && !selectedImageBase64 && !showPollCreator) {
      Alert.alert('Content Required', 'Please enter a title, message, photo, or poll to share.');
      return;
    }

    if (showPollCreator) {
      if (!pollQuestion.trim()) {
        Alert.alert('Poll Question Required', 'Please enter a question for your poll.');
        return;
      }
      const validOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (validOptions.length < 2) {
        Alert.alert('Poll Options Required', 'Please provide at least 2 non-empty poll options.');
        return;
      }
    }

    setIsPublishing(true);
    try {
      const title = newPostTitle.trim() || (showPollCreator ? pollQuestion.trim() : 'Company Update');
      let finalContent = newPostContent.trim() || '';
      if (selectedTags.length > 0) {
        finalContent += `\n\n${selectedTags.join(' ')}`;
      }

      const mediaB64 = selectedImageBase64 ? [selectedImageBase64] : [];
      const cleanPollOptions = showPollCreator
        ? pollOptions.map((o) => o.trim()).filter(Boolean)
        : null;

      const data = await graphqlRequest<{
        createPost: FeedPost;
      }>(CREATE_POST_MUTATION, {
        title,
        content: finalContent,
        mediaB64: mediaB64.length > 0 ? mediaB64 : null,
        pollQuestion: showPollCreator ? pollQuestion.trim() : null,
        pollOptions: cleanPollOptions,
        pollIsMultipleChoice: showPollCreator ? pollIsMultipleChoice : null,
      });

      if (data?.createPost) {
        setPosts((prev) => [data.createPost, ...prev]);
        setIsCreateOpen(false);
        // Reset inputs
        setNewPostTitle('');
        setNewPostContent('');
        setSelectedTags([]);
        setSelectedImageBase64(null);
        setShowPollCreator(false);
        setPollQuestion('');
        setPollOptions(['', '']);
        Alert.alert('Published!', 'Your post has been shared to the company feed.');
      }
    } catch (err: any) {
      Alert.alert('Publish Error', err.message || 'Failed to publish post.');
    } finally {
      setIsPublishing(false);
    }
  };

  // Filtered Posts
  const filteredPosts = posts.filter((p) => {
    if (selectedFilter === 'announcements') {
      return (
        (p.title || '').toLowerCase().includes('announcement') ||
        p.content.toLowerCase().includes('#announcement') ||
        p.content.toLowerCase().includes('announcement')
      );
    }
    if (selectedFilter === 'polls') {
      return Boolean(p.poll);
    }
    if (selectedFilter === 'updates') {
      return (
        p.content.toLowerCase().includes('#update') ||
        p.content.toLowerCase().includes('#kudos') ||
        p.content.toLowerCase().includes('#important')
      );
    }
    return true;
  });

  // Render Post Card
  const renderPostItem = ({ item }: { item: FeedPost }) => {
    const authorName = `${item.author?.firstName || ''} ${item.author?.lastName || ''}`.trim() || 'Team Member';
    const authorInitials = (
      (item.author?.firstName?.charAt(0) || '') + (item.author?.lastName?.charAt(0) || '')
    ).toUpperCase() || 'TM';
    const avatarUri = getAbsoluteUrl(item.author?.profilePictureUrl);
    const isOwner = currentUserEmail && item.author?.email && currentUserEmail === item.author.email.toLowerCase();

    // Clean text and extract hashtags
    const rawContent = item.content || '';
    const cleanBody = rawContent.replace(/<[^>]*>?/gm, '').replace(/#[A-Za-z0-9_]+/g, '').trim();
    const tags = rawContent.match(/#[A-Za-z0-9_]+/g) || [];
    const isAnnouncement =
      tags.some((t) => t.toLowerCase() === '#announcement') ||
      (item.title || '').toLowerCase().includes('announcement');

    return (
      <View
        style={[
          styles.postCard,
          {
            backgroundColor: colors.backgroundCard,
            borderColor: colors.border,
          },
        ]}
      >
        {/* Post Header */}
        <View style={styles.postHeader}>
          <View style={styles.authorGroup}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.authorAvatar} />
            ) : (
              <View style={[styles.authorAvatarFallback, { backgroundColor: accentColors.primary }]}>
                <Text style={styles.authorFallbackText}>{authorInitials}</Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={[styles.authorName, { color: colors.text }]}>{authorName}</Text>
                {isAnnouncement && (
                  <View style={styles.announcementTagPill}>
                    <Ionicons name="sparkles" size={10} color="#ffffff" />
                    <Text style={styles.announcementTagText}>OFFICIAL</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.postTime, { color: colors.textSecondary }]}>
                {formatRelativeTime(item.createdAt)}
              </Text>
            </View>
          </View>

          {/* More / Delete menu for author */}
          {isOwner && (
            <TouchableOpacity
              style={styles.moreBtn}
              onPress={() => handleDeletePost(item.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>

        {/* Title */}
        {item.title ? (
          <Text style={[styles.postTitle, { color: colors.text }]}>{item.title}</Text>
        ) : null}

        {/* Body Content */}
        {cleanBody ? (
          <Text style={[styles.postContent, { color: colors.text }]}>{cleanBody}</Text>
        ) : null}

        {/* Tags */}
        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map((tag, idx) => (
              <View
                key={`${tag}-${idx}`}
                style={[
                  styles.tagBadge,
                  tag.toLowerCase() === '#announcement'
                    ? { backgroundColor: 'rgba(236, 72, 153, 0.15)', borderColor: '#ec4899' }
                    : { backgroundColor: accentColors.light, borderColor: accentColors.primary + '40' },
                ]}
              >
                <Text
                  style={[
                    styles.tagBadgeText,
                    tag.toLowerCase() === '#announcement'
                      ? { color: '#ec4899' }
                      : { color: accentColors.primary },
                  ]}
                >
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Media Images */}
        {item.mediaUrls && item.mediaUrls.length > 0 && (
          <View style={styles.mediaContainer}>
            {item.mediaUrls.length === 1 ? (
              <TouchableOpacity
                style={styles.singleImageContainer}
                activeOpacity={0.9}
                onPress={() => setPreviewImageUrl(getAbsoluteUrl(item.mediaUrls![0]))}
              >
                <Image
                  source={{ uri: getAbsoluteUrl(item.mediaUrls[0])! }}
                  style={styles.singleImage}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ) : (
              <View style={styles.multiImageGrid}>
                {item.mediaUrls.slice(0, 4).map((url, imgIdx) => (
                  <TouchableOpacity
                    key={`${url}-${imgIdx}`}
                    style={styles.multiImageWrap}
                    activeOpacity={0.9}
                    onPress={() => setPreviewImageUrl(getAbsoluteUrl(url))}
                  >
                    <Image
                      source={{ uri: getAbsoluteUrl(url)! }}
                      style={styles.multiImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Interactive Poll */}
        {item.poll && (
          <View style={[styles.pollCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderColor: colors.border }]}>
            <View style={styles.pollHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Ionicons name="bar-chart" size={16} color={accentColors.primary} />
                <Text style={[styles.pollQuestion, { color: colors.text }]}>{item.poll.question}</Text>
              </View>
              <Text style={[styles.pollVotesCount, { color: colors.textSecondary }]}>
                {item.poll.totalVotes} {item.poll.totalVotes === 1 ? 'vote' : 'votes'}
              </Text>
            </View>

            <View style={styles.pollOptionsList}>
              {item.poll.options.map((opt) => {
                const isSelected = item.poll?.isMultipleChoice
                  ? item.poll?.userVotedOptionIds?.includes(opt.id)
                  : item.poll?.userVotedOptionId === opt.id;

                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.pollOptionItem,
                      { borderColor: isSelected ? accentColors.primary : colors.border },
                    ]}
                    onPress={() => handleVotePoll(item.poll!.id, opt.id, item.id)}
                    activeOpacity={0.8}
                  >
                    {/* Percentage fill bar */}
                    <View
                      style={[
                        styles.pollFillBar,
                        {
                          width: `${Math.min(100, Math.max(0, opt.percentage))}%`,
                          backgroundColor: isSelected
                            ? accentColors.primary + '30'
                            : isDark
                            ? 'rgba(255,255,255,0.08)'
                            : 'rgba(0,0,0,0.05)',
                        },
                      ]}
                    />

                    <View style={styles.pollOptionContent}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Ionicons
                          name={
                            isSelected
                              ? item.poll?.isMultipleChoice
                                ? 'checkbox'
                                : 'radio-button-on'
                              : item.poll?.isMultipleChoice
                              ? 'square-outline'
                              : 'radio-button-off'
                          }
                          size={18}
                          color={isSelected ? accentColors.primary : colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.pollOptionText,
                            { color: colors.text },
                            isSelected && { fontWeight: '700', color: accentColors.primary },
                          ]}
                          numberOfLines={2}
                        >
                          {opt.text}
                        </Text>
                      </View>
                      <Text style={[styles.pollPctText, { color: colors.textSecondary }]}>
                        {Math.round(opt.percentage)}%
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Footer Actions */}
        <View style={[styles.postFooter, { borderTopColor: colors.borderLight }]}>
          {/* Like */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleToggleLike(item.id)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={item.hasLiked ? 'heart' : 'heart-outline'}
              size={20}
              color={item.hasLiked ? '#ef4444' : colors.textSecondary}
            />
            <Text
              style={[
                styles.actionBtnText,
                { color: item.hasLiked ? '#ef4444' : colors.textSecondary },
              ]}
            >
              {item.likesCount > 0 ? item.likesCount : 'Like'}
            </Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleOpenComments(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-outline" size={19} color={colors.textSecondary} />
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>
              {item.commentsCount > 0 ? item.commentsCount : 'Comment'}
            </Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleShare(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="share-social-outline" size={19} color={colors.textSecondary} />
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom', 'left', 'right']}>
      {/* Screen Header with Create Button */}
      <ScreenHeader
        title="Company Feed"
        subtitle="Announcements, team updates & polls"
        showBack={true}
        rightElement={
          <TouchableOpacity
            style={[styles.headerCreateBtn, { backgroundColor: accentColors.primary }]}
            onPress={() => setIsCreateOpen(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={20} color="#ffffff" />
            <Text style={styles.headerCreateText}>Post</Text>
          </TouchableOpacity>
        }
      />

      {/* Filter Tabs */}
      <View style={[styles.filterBar, { borderBottomColor: colors.borderLight }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBarScroll}>
          {[
            { key: 'all', label: 'All Posts' },
            { key: 'announcements', label: '📢 Announcements' },
            { key: 'polls', label: '📊 Polls' },
            { key: 'updates', label: '💡 Updates' },
          ].map((tab) => {
            const active = selectedFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: active ? accentColors.primary : isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                    borderColor: active ? accentColors.primary : colors.border,
                  },
                ]}
                onPress={() => setSelectedFilter(tab.key as any)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: active ? '#ffffff' : colors.textSecondary },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Post List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={accentColors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading posts...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPosts}
          keyExtractor={(item) => item.id}
          renderItem={renderPostItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColors.primary} />
          }
          onEndReached={() => {
            if (hasMore && !loading) {
              fetchPosts(page + 1, true);
            }
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconCircle, { backgroundColor: accentColors.light }]}>
                <Ionicons name="newspaper-outline" size={44} color={accentColors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Posts Yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Stay connected with your workplace. Share an update, post a poll, or celebrate with your team.
              </Text>
              <TouchableOpacity
                style={[styles.emptyCreateBtn, { backgroundColor: accentColors.primary }]}
                onPress={() => setIsCreateOpen(true)}
              >
                <Ionicons name="create-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.emptyCreateBtnText}>Create First Post</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* ── CREATE POST MODAL ── */}
      <Modal visible={isCreateOpen} animationType="slide" transparent={false} onRequestClose={() => setIsCreateOpen(false)}>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom', 'left', 'right']}>
          <View style={[styles.createHeader, { borderBottomColor: colors.borderLight }]}>
            <TouchableOpacity onPress={() => setIsCreateOpen(false)} style={styles.createCloseBtn}>
              <Text style={[styles.createCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.createHeaderTitle, { color: colors.text }]}>Create Post</Text>
            <TouchableOpacity
              style={[
                styles.publishBtn,
                { backgroundColor: isPublishing ? accentColors.primary + '70' : accentColors.primary },
              ]}
              onPress={handlePublishPost}
              disabled={isPublishing}
            >
              {isPublishing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.publishBtnText}>Publish</Text>
              )}
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView contentContainerStyle={styles.createScrollContent} showsVerticalScrollIndicator={false}>
              {/* Title Input */}
              <TextInput
                style={[
                  styles.titleInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.backgroundCard,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="Post title (e.g. Q4 Kickoff Highlights)..."
                placeholderTextColor={colors.textMuted}
                value={newPostTitle}
                onChangeText={setNewPostTitle}
              />

              {/* Content Input */}
              <TextInput
                style={[
                  styles.contentInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.backgroundCard,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="Share an update, milestone, or announcement with your team..."
                placeholderTextColor={colors.textMuted}
                value={newPostContent}
                onChangeText={setNewPostContent}
                multiline
                textAlignVertical="top"
              />

              {/* Tag Chips */}
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Add Topic Tag</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsScroll}>
                {SUGGESTED_TAGS.map((tag) => {
                  const selected = selectedTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[
                        styles.tagChip,
                        {
                          backgroundColor: selected ? accentColors.primary : isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                          borderColor: selected ? accentColors.primary : colors.border,
                        },
                      ]}
                      onPress={() => {
                        setSelectedTags((prev) =>
                          selected ? prev.filter((t) => t !== tag) : [...prev, tag]
                        );
                      }}
                    >
                      <Text style={[styles.tagChipText, { color: selected ? '#ffffff' : colors.text }]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Photo Attachment Section */}
              <View style={styles.attachmentBar}>
                <TouchableOpacity
                  style={[styles.attachPhotoBtn, { borderColor: colors.border, backgroundColor: colors.backgroundCard }]}
                  onPress={handlePickImage}
                >
                  <Ionicons name="image-outline" size={20} color={accentColors.primary} />
                  <Text style={[styles.attachPhotoText, { color: colors.text }]}>
                    {selectedImageBase64 ? 'Change Photo' : 'Attach Photo'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.togglePollBtn,
                    {
                      borderColor: showPollCreator ? accentColors.primary : colors.border,
                      backgroundColor: showPollCreator ? accentColors.light : colors.backgroundCard,
                    },
                  ]}
                  onPress={() => setShowPollCreator(!showPollCreator)}
                >
                  <Ionicons
                    name="bar-chart-outline"
                    size={20}
                    color={showPollCreator ? accentColors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.togglePollText,
                      { color: showPollCreator ? accentColors.primary : colors.text },
                    ]}
                  >
                    {showPollCreator ? 'Poll Active' : 'Add Poll'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Image Preview */}
              {selectedImageBase64 && (
                <View style={styles.imagePreviewWrap}>
                  <Image source={{ uri: selectedImageBase64 }} style={styles.attachedImagePreview} />
                  <TouchableOpacity
                    style={styles.removeImageBtn}
                    onPress={() => setSelectedImageBase64(null)}
                  >
                    <Ionicons name="close" size={16} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Poll Builder Accordion */}
              {showPollCreator && (
                <View style={[styles.pollBuilderCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
                  <View style={styles.pollBuilderHeader}>
                    <Ionicons name="bar-chart" size={18} color={accentColors.primary} />
                    <Text style={[styles.pollBuilderTitle, { color: colors.text }]}>Poll Details</Text>
                  </View>

                  <TextInput
                    style={[styles.pollQuestionInput, { color: colors.text, borderColor: colors.border }]}
                    placeholder="Ask a question..."
                    placeholderTextColor={colors.textMuted}
                    value={pollQuestion}
                    onChangeText={setPollQuestion}
                  />

                  <Text style={[styles.optionsLabel, { color: colors.textSecondary }]}>Options</Text>
                  {pollOptions.map((opt, idx) => (
                    <View key={idx} style={styles.optionInputRow}>
                      <TextInput
                        style={[styles.pollOptionInput, { color: colors.text, borderColor: colors.border, flex: 1 }]}
                        placeholder={`Option ${idx + 1}`}
                        placeholderTextColor={colors.textMuted}
                        value={opt}
                        onChangeText={(txt) => {
                          const updated = [...pollOptions];
                          updated[idx] = txt;
                          setPollOptions(updated);
                        }}
                      />
                      {pollOptions.length > 2 && (
                        <TouchableOpacity
                          style={styles.removeOptionBtn}
                          onPress={() => {
                            setPollOptions(pollOptions.filter((_, i) => i !== idx));
                          }}
                        >
                          <Ionicons name="trash-outline" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}

                  {pollOptions.length < 5 && (
                    <TouchableOpacity
                      style={[styles.addOptionBtn, { borderColor: accentColors.primary }]}
                      onPress={() => setPollOptions([...pollOptions, ''])}
                    >
                      <Ionicons name="add" size={16} color={accentColors.primary} />
                      <Text style={[styles.addOptionText, { color: accentColors.primary }]}>Add Option</Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.multiChoiceRow}>
                    <Text style={[styles.multiChoiceLabel, { color: colors.text }]}>Allow Multiple Choices</Text>
                    <Switch
                      value={pollIsMultipleChoice}
                      onValueChange={setPollIsMultipleChoice}
                      trackColor={{ false: '#94a3b8', true: accentColors.primary }}
                    />
                  </View>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── COMMENTS MODAL ── */}
      <Modal visible={!!activeCommentsPost} animationType="slide" transparent={false} onRequestClose={() => setActiveCommentsPost(null)}>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom', 'left', 'right']}>
          <View style={[styles.createHeader, { borderBottomColor: colors.borderLight }]}>
            <TouchableOpacity onPress={() => setActiveCommentsPost(null)} style={styles.createCloseBtn}>
              <Ionicons name="chevron-down" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.createHeaderTitle, { color: colors.text }]}>Comments</Text>
            <View style={{ width: 40 }} />
          </View>

          {commentsLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={accentColors.primary} />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.commentsListContent}
              renderItem={({ item }) => {
                const commentInitials = (
                  (item.author?.firstName?.charAt(0) || '') + (item.author?.lastName?.charAt(0) || '')
                ).toUpperCase() || 'TM';
                const avatar = getAbsoluteUrl(item.author?.profilePictureUrl);

                return (
                  <View style={styles.commentRow}>
                    {avatar ? (
                      <Image source={{ uri: avatar }} style={styles.commentAvatar} />
                    ) : (
                      <View style={[styles.commentAvatarFallback, { backgroundColor: accentColors.primary }]}>
                        <Text style={styles.commentFallbackText}>{commentInitials}</Text>
                      </View>
                    )}

                    <View style={[styles.commentBubble, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]}>
                      <View style={styles.commentHeaderRow}>
                        <Text style={[styles.commentAuthorName, { color: colors.text }]}>
                          {item.author?.firstName} {item.author?.lastName}
                        </Text>
                        <Text style={[styles.commentTime, { color: colors.textSecondary }]}>
                          {formatRelativeTime(item.createdAt)}
                        </Text>
                      </View>
                      <Text style={[styles.commentBody, { color: colors.text }]}>{item.content}</Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyCommentsBox}>
                  <Ionicons name="chatbubbles-outline" size={36} color={colors.textSecondary} />
                  <Text style={[styles.emptyCommentsText, { color: colors.textSecondary }]}>
                    No comments yet. Start the conversation!
                  </Text>
                </View>
              }
            />
          )}

          {/* Comment Input Bar */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.commentInputBar, { backgroundColor: colors.backgroundCard, borderTopColor: colors.borderLight }]}>
              <TextInput
                style={[styles.commentTextInput, { color: colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc', borderColor: colors.border }]}
                placeholder="Write a comment..."
                placeholderTextColor={colors.textMuted}
                value={commentInput}
                onChangeText={setCommentInput}
                multiline
              />
              <TouchableOpacity
                style={[
                  styles.commentSendBtn,
                  {
                    backgroundColor: commentInput.trim() ? accentColors.primary : accentColors.primary + '40',
                  },
                ]}
                onPress={handleSendComment}
                disabled={!commentInput.trim() || isSubmittingComment}
              >
                {isSubmittingComment ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="arrow-up" size={18} color="#ffffff" />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Full-screen Image Viewer Modal */}
      <ImageViewerModal
        visible={!!previewImageUrl}
        imageUrl={previewImageUrl}
        onClose={() => setPreviewImageUrl(null)}
      />
    </SafeAreaView>
  );
}

// =====================================================
// STYLES
// =====================================================
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    gap: 4,
  },
  headerCreateText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  filterBar: {
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  filterBarScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  postCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  authorAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  authorAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authorFallbackText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  authorName: {
    fontSize: 15,
    fontWeight: '700',
  },
  announcementTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ec4899',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  announcementTagText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  postTime: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  moreBtn: {
    padding: 6,
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  postContent: {
    fontSize: 14,
    lineHeight: 22,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  mediaContainer: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  singleImageContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    height: 240,
    backgroundColor: '#00000010',
  },
  singleImage: {
    width: '100%',
    height: '100%',
  },
  multiImageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  multiImageWrap: {
    width: '48.5%',
    height: 140,
    borderRadius: 10,
    overflow: 'hidden',
  },
  multiImage: {
    width: '100%',
    height: '100%',
  },
  pollCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  pollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pollQuestion: {
    fontSize: 14,
    fontWeight: '700',
  },
  pollVotesCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  pollOptionsList: {
    gap: 8,
  },
  pollOptionItem: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    height: 44,
    justifyContent: 'center',
  },
  pollFillBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  pollOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  pollOptionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  pollPctText: {
    fontSize: 12,
    fontWeight: '700',
  },
  postFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyCreateBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Create Modal
  createHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  createCloseBtn: {
    padding: 6,
  },
  createCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  createHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  publishBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  publishBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  createScrollContent: {
    padding: 16,
    gap: 16,
  },
  titleInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '700',
  },
  contentInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 120,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tagsScroll: {
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  attachmentBar: {
    flexDirection: 'row',
    gap: 12,
  },
  attachPhotoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  attachPhotoText: {
    fontSize: 13,
    fontWeight: '600',
  },
  togglePollBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  togglePollText: {
    fontSize: 13,
    fontWeight: '600',
  },
  imagePreviewWrap: {
    position: 'relative',
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
  },
  attachedImagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pollBuilderCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  pollBuilderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pollBuilderTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  pollQuestionInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  optionsLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  optionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pollOptionInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  removeOptionBtn: {
    padding: 6,
  },
  addOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  multiChoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.2)',
  },
  multiChoiceLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Comments Modal
  commentsListContent: {
    padding: 16,
    gap: 16,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  commentAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentFallbackText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  commentBubble: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  commentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentAuthorName: {
    fontSize: 13,
    fontWeight: '700',
  },
  commentTime: {
    fontSize: 10,
    fontWeight: '500',
  },
  commentBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyCommentsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyCommentsText: {
    fontSize: 13,
  },
  commentInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 10,
  },
  commentTextInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
  },
  commentSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
