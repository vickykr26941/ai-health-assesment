from django.contrib import admin
from .models import HealthAssessment, Question, Answer, TreatmentPlan

@admin.register(HealthAssessment)
class HealthAssessmentAdmin(admin.ModelAdmin):
    list_display = ['id', 'session_id', 'status', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['session_id', 'initial_concern']
    readonly_fields = ['id', 'created_at', 'updated_at']

@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ['id', 'assessment', 'question_order', 'is_answered']
    list_filter = ['is_answered', 'created_at']
    search_fields = ['question_text']

@admin.register(Answer)
class AnswerAdmin(admin.ModelAdmin):
    list_display = ['id', 'question', 'created_at']
    search_fields = ['answer_text']

@admin.register(TreatmentPlan)
class TreatmentPlanAdmin(admin.ModelAdmin):
    list_display = ['id', 'assessment', 'created_at']
    readonly_fields = ['created_at']
