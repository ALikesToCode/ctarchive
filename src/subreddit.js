import axios from 'axios';
import dayjs from 'dayjs';
import { marked } from 'marked';

// Import templates
import submissionTemplate from '@/templates/submission.pug';
import postTemplate from '@/templates/post.pug';
import profilePostTemplate from '@/templates/profilePost.pug';

// Convert base 10 number to base 36 string
const base10to36 = (number) => parseInt(number).toString(36);

// API endpoints configuration
const API_ENDPOINTS = {
  submission: "https://api.pullpush.io/reddit/search/submission/",
  commentSearch: "https://api.pullpush.io/reddit/search/comment/",
  commentsBackup: "https://api.pullpush.io/reddit/search/comment/?link_id=",
};

// Configuration constants
const BATCH_SIZE = 10;
const IMAGE_TYPES = ["jpg", "png", "gif", "webp"];
const INFINITE_SCROLL_THRESHOLD = 200; // pixels from bottom to trigger load
const POSTS_PER_PAGE = 25;

// Error messages
const ERROR_MESSAGES = {
  NO_RESULTS: "No submissions found.",
  API_ERROR: "Error communicating with the API. Please try again later.",
  RATE_LIMIT: "Too many requests. Please wait a moment and try again.",
  BAD_REQUEST: "Invalid request parameters.",
};

export const subreddit = {
  link: API_ENDPOINTS,
  template: {
    submission: submissionTemplate,
    post: postTemplate,
    profilePost: profilePostTemplate,
  },
  
  $el: typeof document !== 'undefined' ? (() => {
    const container = document.createElement("div");
    container.id = "submission";
    container.innerHTML = "Loading Submission/Comments or you haven't done a search yet.";
    return container;
  })() : null,
  
  requestCount: 0,
  last: null,
  useOld: false,
  isLoading: false,
  currentParams: null,
  hasMorePosts: true,

  setupInfiniteScroll() {
    if (typeof document === 'undefined') return;

    const handleScroll = () => {
      if (this.isLoading || !this.hasMorePosts) return;

      const scrollHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      const scrollTop = window.scrollY;
      const clientHeight = document.documentElement.clientHeight;

      if (scrollHeight - scrollTop - clientHeight < INFINITE_SCROLL_THRESHOLD) {
        this.loadMorePosts();
      }
    };

    // Debounce scroll handler
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(handleScroll, 100);
    });
  },

  async loadMorePosts() {
    if (!this.currentParams || this.isLoading || !this.hasMorePosts) return;

    this.isLoading = true;
    this.changeStatus("Loading more posts...");

    try {
      const params = new URLSearchParams(this.currentParams);
      if (this.last && this.last.created_utc) {
        // Add before parameter based on the last post's timestamp
        const timestamp = Math.floor(this.last.created_utc);
        if (!isNaN(timestamp)) {
          params.set('before', timestamp);
          console.log('Loading more posts with timestamp:', timestamp);
        } else {
          console.warn('Invalid timestamp:', this.last.created_utc);
          this.hasMorePosts = false;
          this.changeStatus("Cannot load more posts - invalid timestamp");
          return;
        }
      } else {
        console.warn('No valid last post timestamp found');
        this.hasMorePosts = false;
        this.changeStatus("Cannot load more posts");
        return;
      }
      params.set('limit', POSTS_PER_PAGE);

      const request = this.createRequest(params);
      console.log('Loading more posts with request:', request);
      
      const response = await axios.get(`${this.link.submission}?${request}`);

      if (!response.data || !response.data.data || response.data.data.length === 0) {
        this.hasMorePosts = false;
        this.changeStatus("No more posts to load");
        return;
      }

      // Get all currently displayed post IDs
      const existingPostIds = new Set(
        Array.from(document.querySelectorAll('.submission'))
          .map(el => el.getAttribute('data-id'))
          .filter(Boolean)
      );

      // Filter out duplicate posts
      const newPosts = response.data.data.filter(post => !existingPostIds.has(post.id));

      if (newPosts.length === 0) {
        this.hasMorePosts = false;
        this.changeStatus("No more unique posts to load");
        return;
      }

      // Sort posts by created_utc to ensure proper ordering
      newPosts.sort((a, b) => b.created_utc - a.created_utc);

      await this.processBatch(newPosts, 0, false);
      this.changeStatus(`Loaded ${newPosts.length} new posts`);

      // If we got fewer unique posts than requested, try loading more
      if (newPosts.length < POSTS_PER_PAGE / 2) {
        console.log('Got fewer unique posts than expected, trying to load more...');
        setTimeout(() => this.loadMorePosts(), 1000);
      }
    } catch (error) {
      console.error("Error loading more posts:", error);
      if (error.response?.status === 400) {
        this.hasMorePosts = false;
        this.changeStatus("No more posts available");
      } else {
        this.changeStatus("Error loading more posts. Please try again.");
      }
    } finally {
      this.isLoading = false;
    }
  },

  changeStatus(status) {
    if (typeof document === 'undefined') return;
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.innerHTML = status;
    }
  },

  createRequest(urlParams) {
    return Array.from(urlParams.entries())
      .filter(([key, value]) => value !== "" && key !== "mode")
      .map(([key, value]) => {
        // Only convert date strings for 'since' and 'until'
        // 'before' and 'after' are already timestamps
        if (["since", "until"].includes(key) && value !== "") {
          value = Math.floor(new Date(value).getTime() / 1000);
        }
        return `${key}=${encodeURIComponent(value)}`;
      })
      .join("&");
  },

  // Process submissions in batches
  async processBatch(submissions, startIndex, clearContainer = true) {
    if (!this.$el) return;
    
    const endIndex = Math.min(startIndex + BATCH_SIZE, submissions.length);
    const batch = submissions.slice(startIndex, endIndex);

    console.log(`Processing batch ${startIndex} to ${endIndex} of ${submissions.length}`);
    
    if (clearContainer) {
      this.$el.innerHTML = "";
    }

    batch.forEach(submission => {
      submission.time = dayjs.unix(submission.created_utc).format("llll");
      
      // Only set thumbnail if it's an image URL
      if (submission.url) {
        const extension = submission.url.split(".").pop().toLowerCase();
        if (IMAGE_TYPES.includes(extension)) {
          submission.thumbnail = submission.url;
        }
      }
      
      // Set default values for missing required fields
      const requiredFields = ['id', 'author', 'title', 'score', 'num_comments', 'subreddit'];
      requiredFields.forEach(field => {
        if (!submission[field]) {
          if (field === 'num_comments') submission[field] = 0;
          else if (field === 'score') submission[field] = 0;
          else if (field === 'author') submission[field] = '[deleted]';
        }
      });
      
      try {
        console.log('Rendering submission:', {
          id: submission.id,
          title: submission.title,
          author: submission.author,
          score: submission.score,
          num_comments: submission.num_comments,
          created_utc: submission.created_utc
        });
        
        const html = this.template.submission(submission);
        if (!html) {
          console.error('Template rendered empty HTML for submission:', submission);
          return;
        }
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html.trim();
        
        if (!tempDiv.firstChild) {
          console.error('No elements created from HTML:', html);
          return;
        }
        
        // Add data-id attribute to the submission element
        const submissionElement = tempDiv.firstChild;
        submissionElement.setAttribute('data-id', submission.id);
        
        // Get all child nodes and append them to the container
        while (tempDiv.firstChild) {
          this.$el.appendChild(tempDiv.firstChild);
        }
        
        this.last = submission;
      } catch (error) {
        console.error('Error rendering submission:', error);
        console.log('Submission data:', submission);
      }
    });

    // Process next batch if available
    if (endIndex < submissions.length) {
      setTimeout(() => {
        this.processBatch(submissions, endIndex, false);
      }, 10); // Small delay to prevent UI blocking
    } else {
      this.changeStatus("Submissions Loaded");
    }
  },

  async grabSubmissions(urlParams) {
    try {
      this.changeStatus("Loading Submissions");
      this.currentParams = urlParams.toString();
      this.hasMorePosts = true;
      this.isLoading = true;

      const request = this.createRequest(urlParams);
      const response = await axios.get(`${this.link.submission}?${request}`);
      
      if (!response.data || !response.data.data) {
        throw new Error(ERROR_MESSAGES.API_ERROR);
      }
      
      console.log('Received submissions:', response.data.data.length);
      
      if (this.$el) {
        this.$el.innerHTML = "";
        if (response.data.data.length === 0) {
          this.$el.innerHTML = ERROR_MESSAGES.NO_RESULTS;
          this.changeStatus(ERROR_MESSAGES.NO_RESULTS);
          this.hasMorePosts = false;
          return;
        }
        // Start processing submissions in batches
        await this.processBatch(response.data.data, 0);
        
        // Setup infinite scroll after initial load
        this.setupInfiniteScroll();
      }
    } catch (error) {
      console.error("Error loading submissions:", error);
      const errorMessage = error.response?.status === 429 ? ERROR_MESSAGES.RATE_LIMIT :
                          error.response?.status === 400 ? ERROR_MESSAGES.BAD_REQUEST :
                          ERROR_MESSAGES.API_ERROR;
      this.changeStatus(errorMessage);
      if (this.$el) {
        this.$el.innerHTML = errorMessage;
      }
    } finally {
      this.isLoading = false;
    }
  },

  async grabComments(id, highlight) {
    try {
      this.changeStatus("Loading Comments");
      this.set_reddit_link(id);
      if (this.$el) {
        this.$el.innerHTML = "";
      }

      const submissionResponse = await axios.get(`${this.link.submission}?ids=${id}`);
      const submission = submissionResponse.data.data[0];
      
      if (!submission) {
        throw new Error("Submission not found");
      }
      
      submission.time = dayjs.unix(submission.created_utc).format("llll");
      submission.selftext = marked.parse(submission.selftext || '');
      
      if (this.$el) {
        try {
          // Create the main submission HTML
          const html = this.template.submission(submission);
          this.$el.innerHTML = html;

          // Create comments container structure
          const commentsContainer = document.createElement('div');
          commentsContainer.id = 'comments_fix';
          commentsContainer.className = 'comments';
          
          const orphansContainer = document.createElement('div');
          orphansContainer.id = 'orphans';
          orphansContainer.className = 'orphans';
          
          // Add containers to the DOM
          this.$el.appendChild(commentsContainer);
          this.$el.appendChild(orphansContainer);
          
          console.log('Created comments structure:', {
            commentsContainer: !!commentsContainer,
            orphansContainer: !!orphansContainer
          });
        } catch (error) {
          console.error('Error rendering submission:', error);
          console.log('Submission data:', submission);
          this.$el.innerHTML = "Error rendering submission.";
        }
      }
      
      this.changeStatus("Submission Loaded");
      await this.loadCommentsBackup(id, highlight);
      this.changeStatus("Comments Loaded");
    } catch (error) {
      console.error("Error loading comments:", error, error.response?.data);
      const errorMessage = error.response?.status === 429 ? ERROR_MESSAGES.RATE_LIMIT :
                          error.response?.status === 400 ? ERROR_MESSAGES.BAD_REQUEST :
                          error.message === "Submission not found" ? "Submission not found" :
                          ERROR_MESSAGES.API_ERROR;
      this.changeStatus(errorMessage);
      if (this.$el) {
        this.$el.innerHTML = errorMessage;
      }
    }
  },

  sleep(ms) {
    this.changeStatus(`Waiting for: ${ms}ms`);
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  async searchComments(urlParams) {
    try {
      const request = this.createRequest(urlParams);
      const response = await axios.get(`${this.link.commentSearch}?${request}`);
      
      if (!response.data || !response.data.data) {
        throw new Error(ERROR_MESSAGES.API_ERROR);
      }
      
      if (this.$el) {
        this.$el.innerHTML = "";
        
        if (response.data.data.length === 0) {
          this.$el.innerHTML = ERROR_MESSAGES.NO_RESULTS;
          return;
        }

        response.data.data.forEach(post => {
          try {
            post.time = dayjs.unix(post.created_utc).format("llll");
            post.body = marked.parse(post.body);
            post.link_id = post.link_id.split("_").pop();
            
            const html = this.template.profilePost(post);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            while (tempDiv.firstChild) {
              this.$el.appendChild(tempDiv.firstChild);
            }
            
            this.last = post;
          } catch (error) {
            console.error('Error rendering comment:', error);
          }
        });
      }
    } catch (error) {
      console.error("Error searching comments:", error);
      const errorMessage = error.response?.status === 429 ? ERROR_MESSAGES.RATE_LIMIT :
                          error.response?.status === 400 ? ERROR_MESSAGES.BAD_REQUEST :
                          ERROR_MESSAGES.API_ERROR;
      this.changeStatus(errorMessage);
      if (this.$el) {
        this.$el.innerHTML = errorMessage;
      }
    }
  },

  async loadCommentsBackup(id, highlight, created_utc = null) {
    try {
      this.changeStatus("Loading Comments");
      let url = `${this.link.commentsBackup}${id}`;
      
      if (created_utc !== null) {
        url += `&after=${created_utc + 1}`;
      }

      console.log('Loading comments from URL:', url);

      if (this.requestCount > 10) {
        this.requestCount = 0;
        await this.sleep(10000);
      }

      const response = await axios.get(url);
      
      if (!response.data || !response.data.data) {
        throw new Error(ERROR_MESSAGES.API_ERROR);
      }
      
      console.log('Received comments:', response.data.data.length);
      this.requestCount++;

      if (typeof document !== 'undefined') {
        const fragment = document.createDocumentFragment();
        let lastPost = null;

        response.data.data.forEach(post => {
          try {
            post.time = dayjs.unix(post.created_utc).format("llll");
            post.postClass = post.id === highlight ? "post_highlight" : "post";
            post.body = marked.parse(post.body);
            post.parent_id = this.getParentId(post, id);
            
            console.log('Processing comment:', {
              id: post.id,
              parent_id: post.parent_id,
              created_utc: post.created_utc
            });
            
            this.insertComment(post, id, fragment);
            lastPost = post;
          } catch (error) {
            console.error('Error processing comment:', error, post);
          }
        });

        // Batch DOM updates
        const commentsFixEl = document.getElementById("comments_fix");
        if (commentsFixEl) {
          commentsFixEl.appendChild(fragment);
          console.log('Appended comments to container');
        } else {
          console.error('Comments container not found');
        }

        if (lastPost && lastPost.created_utc !== created_utc) {
          await this.loadCommentsBackup(id, highlight, lastPost.created_utc);
        } else {
          this.changeStatus("Comments Loaded");
        }

        if (highlight) {
          requestAnimationFrame(() => {
            const highlightElement = document.getElementById(highlight);
            if (highlightElement) highlightElement.scrollIntoView({ behavior: 'smooth' });
          });
        }
      }
    } catch (error) {
      console.error('Error loading comments:', error);
      this.changeStatus("Error, most likely too many requests. Try again later");
    }
  },

  getParentId(post, submissionId) {
    if (typeof post.parent_id === "undefined") {
      return `t3_${submissionId}`;
    }
    if (typeof post.parent_id === "number") {
      return `t1_${base10to36(post.parent_id)}`;
    }
    return post.parent_id;
  },

  insertComment(post, id, fragment) {
    if (typeof document === 'undefined') return;
    
    const div = document.createElement('div');
    div.innerHTML = this.template.post(post);
    const commentElement = div.firstChild;
    
    const parent = document.getElementById(post.parent_id);
    if (parent) {
      const childrenContainer = parent.querySelector('.children');
      if (childrenContainer) {
        childrenContainer.appendChild(commentElement);
      }
    } else if (post.parent_id === null && fragment) {
      fragment.appendChild(commentElement);
    } else {
      post.postClass = "orphan";
      const orphans = document.getElementById("orphans");
      if (orphans) orphans.appendChild(commentElement);
    }
  },

  set_reddit_link(id) {
    if (typeof document === 'undefined') return;
    
    const redditLinkElement = document.getElementById("reddit_link");
    if (!redditLinkElement) return;
    
    redditLinkElement.innerHTML = id 
      ? `<a href='https://reddit.com/${id}'>Submission on reddit</a>`
      : "";
  },
};
