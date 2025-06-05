from django.contrib import admin

# Register your models here.

from django.db import models
from django.contrib.auth.models import User
import uuid

class HealthAssessment(models.Model):
    STATUS_CHOICES = [
        ('started', 'Started'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('treatment_generated', 'Treatment Generated'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    session_id = models.CharField(max_length=100, unique=True)
    initial_concern = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='started')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Assessment {self.id} - {self.status}"

class Question(models.Model):
    assessment = models.ForeignKey(HealthAssessment, on_delete=models.CASCADE, related_name='questions')
    question_text = models.TextField()
    question_order = models.IntegerField()
    is_answered = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['question_order']
    
    def __str__(self):
        return f"Q{self.question_order}: {self.question_text[:50]}"

class Answer(models.Model):
    question = models.OneToOneField(Question, on_delete=models.CASCADE, related_name='answer')
    answer_text = models.TextField()
    created_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Answer to {self.question.id}: {self.answer_text[:50]}"

class TreatmentPlan(models.Model):
    assessment = models.OneToOneField(HealthAssessment, on_delete=models.CASCADE, related_name='treatment_plan')
    diagnosis = models.TextField()
    recommendations = models.JSONField(default=list)
    medications = models.JSONField(default=list)
    lifestyle_changes = models.JSONField(default=list)
    followup_instructions = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Treatment Plan for {self.assessment.id}"
